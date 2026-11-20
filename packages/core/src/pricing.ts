import type { Usage } from "./types.js";

/**
 * Published rates used by the cost model.
 *
 * Decisions (gpt-6-luna), from the Decisions guide:
 * uncached input is $0.10 / 1M tokens and output tokens are not charged.
 * Cache-read and cache-write rates follow standard gpt-6-luna prompt caching:
 * cached input $0.01 / 1M, 30-minute cache writes $0.125 / 1M.
 * https://developers.openai.com/api/docs/guides/decisions
 * https://developers.openai.com/api/docs/pricing
 *
 * System Two defaults to gpt-6.2-sol short-context Responses rates:
 * input $2 / 1M, cached input $0.10 / 1M, output $10 / 1M.
 * Support tickets stay under the long-context threshold, so that multiplier is not applied.
 */
export const PRICE_TABLE = {
  decisions: {
    model: "gpt-6-luna",
    uncachedInputPerMillion: 0.1,
    cachedInputPerMillion: 0.01,
    cacheWritePerMillion: 0.125,
    outputPerMillion: 0,
  },
  agent: {
    model: "gpt-6.2-sol",
    uncachedInputPerMillion: 2,
    cachedInputPerMillion: 0.1,
    outputPerMillion: 10,
  },
} as const;

function uncachedInput(usage: Usage): number {
  return Math.max(
    0,
    usage.inputTokens - usage.cachedTokens - usage.cacheWriteTokens,
  );
}

/** Cost of one Decisions API call. Output tokens are free on this endpoint. */
export function decisionsCostUsd(usage: Usage): number {
  const rates = PRICE_TABLE.decisions;
  return (
    (uncachedInput(usage) / 1_000_000) * rates.uncachedInputPerMillion +
    (usage.cachedTokens / 1_000_000) * rates.cachedInputPerMillion +
    (usage.cacheWriteTokens / 1_000_000) * rates.cacheWritePerMillion +
    (usage.outputTokens / 1_000_000) * rates.outputPerMillion
  );
}

/** Cost of one Responses API call at gpt-6.2-sol short-context rates. */
export function agentCostUsd(usage: Usage): number {
  const rates = PRICE_TABLE.agent;
  const uncached = Math.max(0, usage.inputTokens - usage.cachedTokens);
  return (
    (uncached / 1_000_000) * rates.uncachedInputPerMillion +
    (usage.cachedTokens / 1_000_000) * rates.cachedInputPerMillion +
    (usage.outputTokens / 1_000_000) * rates.outputPerMillion
  );
}

export function estimateTokens(text: string): number {
  if (text.length === 0) return 0;
  return Math.ceil(text.length / 4);
}
