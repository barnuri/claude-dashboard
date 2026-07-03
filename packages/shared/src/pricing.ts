/**
 * Pricing reference (USD per 1M tokens), cached from platform.claude.com as of 2026-06-24.
 * Cache write multipliers: 1.25x base input for 5m TTL, 2x base input for 1h TTL.
 * Cache read multiplier: ~0.1x base input, applied uniformly across models.
 */
export interface ModelPricing {
  /** Human label for the UI. */
  label: string;
  inputPerMTok: number;
  outputPerMTok: number;
  /** Max context window in tokens, used for the "context used" gauge. */
  contextLimit: number;
  /** Model ID this entry was resolved from, in case of alias/fallback matching. */
  estimated?: boolean;
}

const CACHE_WRITE_5M_MULTIPLIER = 1.25;
const CACHE_WRITE_1H_MULTIPLIER = 2;
const CACHE_READ_MULTIPLIER = 0.1;

// Sonnet 5 intro pricing window: $2/$10 per MTok through 2026-08-31, then $3/$15.
const SONNET_5_INTRO_CUTOFF = new Date("2026-08-31T23:59:59Z").getTime();

const BASE_PRICING: Record<string, ModelPricing> = {
  "claude-fable-5": { label: "Claude Fable 5", inputPerMTok: 10, outputPerMTok: 50, contextLimit: 1_000_000 },
  "claude-mythos-5": { label: "Claude Mythos 5", inputPerMTok: 10, outputPerMTok: 50, contextLimit: 1_000_000 },
  "claude-mythos-preview": { label: "Claude Mythos Preview", inputPerMTok: 10, outputPerMTok: 50, contextLimit: 1_000_000 },
  "claude-opus-4-8": { label: "Claude Opus 4.8", inputPerMTok: 5, outputPerMTok: 25, contextLimit: 1_000_000 },
  "claude-opus-4-7": { label: "Claude Opus 4.7", inputPerMTok: 5, outputPerMTok: 25, contextLimit: 1_000_000 },
  "claude-opus-4-6": { label: "Claude Opus 4.6", inputPerMTok: 5, outputPerMTok: 25, contextLimit: 1_000_000 },
  "claude-opus-4-5": { label: "Claude Opus 4.5", inputPerMTok: 5, outputPerMTok: 25, contextLimit: 1_000_000 },
  "claude-opus-4-1": { label: "Claude Opus 4.1", inputPerMTok: 15, outputPerMTok: 75, contextLimit: 200_000 },
  "claude-opus-4-0": { label: "Claude Opus 4", inputPerMTok: 15, outputPerMTok: 75, contextLimit: 200_000 },
  "claude-sonnet-5": { label: "Claude Sonnet 5", inputPerMTok: 3, outputPerMTok: 15, contextLimit: 1_000_000 },
  "claude-sonnet-4-6": { label: "Claude Sonnet 4.6", inputPerMTok: 3, outputPerMTok: 15, contextLimit: 1_000_000 },
  "claude-sonnet-4-5": { label: "Claude Sonnet 4.5", inputPerMTok: 3, outputPerMTok: 15, contextLimit: 1_000_000 },
  "claude-sonnet-4-0": { label: "Claude Sonnet 4", inputPerMTok: 3, outputPerMTok: 15, contextLimit: 1_000_000 },
  "claude-haiku-4-5": { label: "Claude Haiku 4.5", inputPerMTok: 1, outputPerMTok: 5, contextLimit: 200_000 },
};

const FALLBACK_PRICING: ModelPricing = {
  label: "Unknown model",
  inputPerMTok: 3,
  outputPerMTok: 15,
  contextLimit: 200_000,
  estimated: true,
};

/** Resolve pricing for a model ID as it appears in a Claude Code transcript's `message.model` field. */
export function resolveModelPricing(modelId: string | null | undefined, now: number = Date.now()): ModelPricing {
  if (!modelId) return FALLBACK_PRICING;

  if (modelId === "claude-sonnet-5" && now > SONNET_5_INTRO_CUTOFF) {
    return { label: "Claude Sonnet 5", inputPerMTok: 3, outputPerMTok: 15, contextLimit: 1_000_000 };
  }
  if (modelId === "claude-sonnet-5") {
    return { label: "Claude Sonnet 5 (intro pricing)", inputPerMTok: 2, outputPerMTok: 10, contextLimit: 1_000_000 };
  }

  const exact = BASE_PRICING[modelId];
  if (exact) return exact;

  // Try matching a dated snapshot id like claude-opus-4-5-20251101 against its bare alias.
  const aliasMatch = Object.keys(BASE_PRICING).find((alias) => modelId.startsWith(alias));
  if (aliasMatch) return { ...BASE_PRICING[aliasMatch]!, estimated: true };

  return { ...FALLBACK_PRICING, label: modelId };
}

export interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheCreation5m: number;
  cacheCreation1h: number;
}

export interface CostBreakdown {
  inputUsd: number;
  outputUsd: number;
  cacheWriteUsd: number;
  cacheReadUsd: number;
  totalUsd: number;
}

export function calculateCost(usage: UsageTotals, pricing: ModelPricing): CostBreakdown {
  const inputUsd = (usage.inputTokens / 1_000_000) * pricing.inputPerMTok;
  const outputUsd = (usage.outputTokens / 1_000_000) * pricing.outputPerMTok;
  const cacheWriteUsd =
    (usage.cacheCreation5m / 1_000_000) * pricing.inputPerMTok * CACHE_WRITE_5M_MULTIPLIER +
    (usage.cacheCreation1h / 1_000_000) * pricing.inputPerMTok * CACHE_WRITE_1H_MULTIPLIER;
  const cacheReadUsd = (usage.cacheRead / 1_000_000) * pricing.inputPerMTok * CACHE_READ_MULTIPLIER;
  return {
    inputUsd,
    outputUsd,
    cacheWriteUsd,
    cacheReadUsd,
    totalUsd: inputUsd + outputUsd + cacheWriteUsd + cacheReadUsd,
  };
}
