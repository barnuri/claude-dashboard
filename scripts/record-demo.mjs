#!/usr/bin/env bun
/**
 * Records a short GIF demo of the dashboard for the README.
 *
 * Boots the API server and the Vite dev server on isolated ports (so this can run
 * alongside your normal `bun run dev`), drives the UI with Playwright, records video,
 * then converts it to docs/demo.gif with a system `ffmpeg`.
 *
 * Requires:
 *   - Playwright's Chromium (bunx playwright install chromium, once)
 *   - a system ffmpeg with the palettegen/paletteuse filters and gif muxer
 *     (the ffmpeg Playwright bundles internally is a stripped-down build used only
 *     for recording webm, and can't produce a gif — this script needs a real one:
 *     `apt install ffmpeg` / `brew install ffmpeg`)
 *
 * Usage:
 *   bun run demo:record
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const ROOT = new URL("..", import.meta.url).pathname;
const SERVER_PORT = 4391;
const WEB_PORT = 5191;
const OUT_DIR = join(ROOT, "docs");
const OUT_GIF = join(OUT_DIR, "demo.gif");

function waitForHttp(url, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await fetch(url);
        if (res.ok || res.status < 500) return resolve();
      } catch {
        // not up yet
      }
      if (Date.now() > deadline) return reject(new Error(`Timed out waiting for ${url}`));
      setTimeout(tick, 300);
    };
    tick();
  });
}

function spawnProcess(cmd, args, opts) {
  const proc = spawn(cmd, args, { stdio: "inherit", ...opts });
  return proc;
}

/** A real, non-Playwright ffmpeg with palette filters and gif output support. */
function findSystemFfmpeg() {
  const res = spawnSync("ffmpeg", ["-hide_banner", "-muxers"], { encoding: "utf8" });
  if (res.status === 0 && /\bgif\b/.test(res.stdout ?? "")) return "ffmpeg";
  return null;
}

async function runDemoSequence(page) {
  page.setDefaultTimeout(5000);
  await page.goto(`http://localhost:${WEB_PORT}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  // Let the live snapshot render, then take a beat on the stat tiles.
  await page.getByText("Token mix").scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(1200);

  // Open the agent-platform audit session — it's the one mock session wired up to show off the
  // task board panel, an unresolved AskUserQuestion card, and the live running-turn indicator
  // together (see packages/server/src/mock.ts "mock-agent-platform-audit").
  const auditCard = page.getByRole("button", { name: /agent-platform/ });
  const fallbackCard = page.getByRole("button", { name: "View" }).first();
  const sessionCard = (await auditCard.count()) ? auditCard : fallbackCard;
  const openButton = (await auditCard.count()) ? auditCard.getByRole("button", { name: "View" }) : sessionCard;
  if (await sessionCard.count()) {
    await openButton.click();
    await page.waitForTimeout(2500); // let the task board + question card render
    await page.waitForTimeout(1500); // linger so the "processing" elapsed-time chip visibly ticks
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
  }

  // Filter the session list.
  const search = page.getByPlaceholder("Filter by folder or branch…");
  await search.click();
  await search.type("claude", { delay: 60 });
  await page.waitForTimeout(900);
  await search.fill("");
  await page.waitForTimeout(400);

  const allFilter = page.locator("label", { hasText: "All" }).first();
  if (await allFilter.count()) {
    await allFilter.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(500);
    await page
      .locator("label", { hasText: "Active" })
      .first()
      .click({ timeout: 3000 })
      .catch(() => {});
    await page.waitForTimeout(500);
  }

  // Open the new-session form to show how you'd launch one — don't actually submit it.
  await page.getByRole("button", { name: "New session" }).click();
  await page.waitForTimeout(500);
  await page.getByPlaceholder("/home/you/projects/my-app").type("/home/you/projects/my-app", { delay: 35 });
  await page
    .getByPlaceholder(/Fix the failing tests/)
    .type("Review the auth module for security issues.", { delay: 25 });
  await page.waitForTimeout(1000);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);
}

async function convertToGif(webmPath) {
  const ffmpeg = findSystemFfmpeg();
  if (!ffmpeg) {
    console.warn(
      "\nCould not find a system ffmpeg with gif support. Install one (e.g. `apt install ffmpeg` or " +
        "`brew install ffmpeg`) and re-run this script.\n" +
        `The raw recording is still available at: ${webmPath}`
    );
    return null;
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const palette = join(tmpdir(), `demo-palette-${Date.now()}.png`);

  await new Promise((resolve, reject) => {
    const p = spawn(
      ffmpeg,
      [
        "-y",
        "-i",
        webmPath,
        "-vf",
        "fps=10,scale=860:-1:flags=lanczos,palettegen=max_colors=192:stats_mode=diff",
        palette,
      ],
      { stdio: "inherit" }
    );
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`palettegen exited ${code}`))));
  });

  await new Promise((resolve, reject) => {
    const p = spawn(
      ffmpeg,
      [
        "-y",
        "-i",
        webmPath,
        "-i",
        palette,
        "-filter_complex",
        "fps=10,scale=860:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer",
        OUT_GIF,
      ],
      { stdio: "inherit" }
    );
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`paletteuse exited ${code}`))));
  });

  rmSync(palette, { force: true });
  return OUT_GIF;
}

async function main() {
  const videoDir = mkdtempSync(join(tmpdir(), "claude-dashboard-demo-"));
  let serverProc, webProc, browser;

  try {
    console.log("Starting API server and web dev server on isolated ports…");
    serverProc = spawnProcess("bun", ["run", "--cwd", "packages/server", "start"], {
      cwd: ROOT,
      // CLAUDE_DASHBOARD_MOCK keeps real ~/.claude sessions and processes out of the recording.
      env: { ...process.env, PORT: String(SERVER_PORT), CLAUDE_DASHBOARD_MOCK: "1" },
    });
    webProc = spawnProcess("bun", ["run", "--cwd", "packages/web", "dev", "--", "--port", String(WEB_PORT), "--strictPort"], {
      cwd: ROOT,
      env: { ...process.env, CLAUDE_DASHBOARD_API: `http://localhost:${SERVER_PORT}` },
    });

    await waitForHttp(`http://localhost:${SERVER_PORT}/api/snapshot`);
    await waitForHttp(`http://localhost:${WEB_PORT}`);
    console.log("Both servers are up. Launching browser…");

    browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      recordVideo: { dir: videoDir, size: { width: 1280, height: 800 } },
    });
    const page = await context.newPage();

    await runDemoSequence(page);

    await context.close();
    const video = await page.video()?.path();
    await browser.close();
    browser = null;

    if (!video) throw new Error("Playwright did not produce a video file");

    console.log(`Recorded ${video}, converting to GIF…`);
    const gif = await convertToGif(video);
    if (gif) console.log(`\nDemo GIF written to ${gif}`);
  } finally {
    browser?.close().catch(() => {});
    serverProc?.kill("SIGTERM");
    webProc?.kill("SIGTERM");
    rmSync(videoDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
