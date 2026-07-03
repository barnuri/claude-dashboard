# Claude Sessions Dashboard

A local dashboard for keeping an eye on every Claude Code CLI session running on your
machine — across terminals, folders, and instances — in one place. It shows what each
session is currently doing, its token usage and running cost, lets you kill any of them,
and can launch new ones.

It runs entirely on your own machine: a small Bun backend reads Claude Code's own session
transcripts from `~/.claude/projects/**/*.jsonl` and cross-references the live process
table, and a React frontend renders it with live updates over a WebSocket. Nothing is sent
anywhere else.

## Demo

![Dashboard demo](docs/demo.gif)

The recording above is the real app, driven by [`scripts/record-demo.mjs`](scripts/record-demo.mjs)
against a live session — nothing staged. Regenerate it with `bun run demo:record` (needs
Playwright's Chromium — `bunx playwright install chromium` — and a system `ffmpeg`).

## Stack

- **Bun** — package manager, runtime, and the backend server (`Bun.serve`, no framework)
- **React 19 + Vite** — frontend
- **Mantine** (`@mantine/core`, `@mantine/charts`, `@mantine/notifications`) — UI
  primitives and charts (built on Recharts), so the app isn't reinventing buttons,
  progress bars, or chart rendering
- **TanStack Query** — data fetching/caching, kept live by the backend's WebSocket push

## Getting started

```bash
bun install
bun run dev
```

This starts the API server on `http://localhost:3334` and the Vite dev server on
`http://localhost:5280` (which proxies `/api` and `/ws` to the backend). Open
`http://localhost:5280`.

For a production-style run, use a single command:

```bash
bun run start
```

`bun run start` is self-contained:

- Builds the web UI first if `packages/web/dist` is missing or stale.
- Serves the built UI **and** the API/WebSocket from the same server on
  `http://localhost:3334` — open that URL directly.
- Watches both sides while it runs: server-source edits restart the server
  (`bun --watch`), and client-source edits rebuild `packages/web/dist`
  (`vite build --watch`), which the running server then serves.

`bun run serve` is also available if you only want the server (no build, no watchers) —
this is what the system service runs, and it defaults to port `3333`.

### Ports: local vs service

A local run and the installed system service use **different ports on purpose**, so you
can run `bun start` for development while the always-on service keeps running untouched:

- **`bun start` / `bun run dev`** → server on **3334** (dev UI proxies to it).
- **Installed service** (`bun run service:install`) → server on **3333**.

Ports and paths are overridable via environment variables:

| Variable               | Default                 | Purpose                                             |
| ---------------------- | ----------------------- | --------------------------------------------------- |
| `PORT`                 | `3334` local / `3333` service | Server (API + WebSocket + built UI) port      |
| `WEB_PORT`             | `5280`                  | Vite dev server port (`bun run dev`)                |
| `WEB_DIST`             | `packages/web/dist`     | Built UI directory the server serves                |
| `CLAUDE_DASHBOARD_API` | `http://localhost:3334` | Proxy target for the Vite dev server                |

## Running as a system service

To keep the dashboard running on boot/login with a watchdog that restarts it if it ever
dies, install it as a user-level system service:

```bash
bun run service:install     # macOS → launchd agent; Linux → systemd user unit
bun run service:uninstall   # remove it
```

- **macOS** installs a launchd agent (`~/Library/LaunchAgents/com.claude-dashboard.server.plist`)
  with `RunAtLoad` (starts at login) and `KeepAlive` (the watchdog — relaunched whenever it
  exits). Logs go to `~/.claude-dashboard/logs/service.{out,err}.log`.
- **Linux** installs a systemd user unit
  (`~/.config/systemd/user/com.claude-dashboard.server.service`) with `Restart=always`
  (the watchdog) and enables it at login.

The service runs `bun run serve` from the repo, so make sure the UI has been built at
least once (`bun run build`, or a prior `bun run start`). It listens on port `3333` (set
explicitly in the service definition, so it stays independent of a local `bun start` on
3334).

## How session discovery works

Claude Code already writes a transcript of every session to
`~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`. The server:

1. Walks that directory tree and parses each transcript (incrementally — a file is only
   re-parsed when its size/mtime changes) to get the working directory, git branch,
   model, token usage, cost, and the most recent thing the assistant did.
2. Scans the OS process table for running `claude` processes and resolves each one's
   working directory (`/proc/<pid>/cwd` on Linux, `lsof` on macOS) to figure out which
   transcripts currently have a live process behind them.
3. Merges the two into a session list: sessions with a live process are `running` or
   `waiting_input` (turn finished, waiting on you); everything else is `ended`.
4. Broadcasts the result over `/ws` roughly every 2 seconds, and immediately after you
   kill or launch a session.

Cost is computed from each transcript's recorded token usage against the current Claude
API pricing table (`packages/shared/src/pricing.ts`), including the split between base
input/output tokens, prompt-cache writes (5m/1h), and prompt-cache reads.

## Creating new sessions

"New session" spawns `claude -p "<prompt>"` (non-interactive/headless mode) detached in
the folder you choose, with the model and permission mode you pick. It shows up in the
dashboard like any other session as soon as it starts writing its transcript.

Since it's spawned headlessly, you can't type into it from the browser — that's by
design (see below). To pick up a session interactively in a real terminal afterwards
(new or one you started yourself), use the "Resume" button on any session card, which
copies:

```bash
claude --resume <session-id>
```

## Design choices / limitations

- **Read-only observation, not a web terminal.** The dashboard shows status, live
  activity, tokens, and cost, and can start/stop sessions, but doesn't attempt to proxy
  a full interactive TTY into the browser. Use `claude --resume <id>` in a real terminal
  for that.
- **Local, single-user, no auth.** It binds to `localhost` and assumes you're the only
  one who can reach it. Don't expose port 3333 or 5280 to a network you don't trust.
- **Best-effort process matching.** If two terminals are `cd`'d into the exact same
  directory, the dashboard does its best to pair each live process with the most
  recently active transcript in that directory, but it's a heuristic, not a guarantee.
