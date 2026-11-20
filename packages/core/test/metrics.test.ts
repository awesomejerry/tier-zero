import { describe, expect, it } from "vitest";
import { agentCostUsd, decisionsCostUsd, percentile, summarize, type MetricRow } from "@tier-zero/core";

describe("pricing", () => {
  it("charges Decisions input and not Decisions output", () => {
    const cost = decisionsCostUsd({
      inputTokens: 1_000_000,
      cachedTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 50_000,
    });
    expect(cost).toBeCloseTo(0.1, 8);
  });

  it("splits cached reads and cache writes out of the uncached input", () => {
    const cost = decisionsCostUsd({
      inputTokens: 1_000_000,
      cachedTokens: 400_000,
      cacheWriteTokens: 100_000,
      outputTokens: 0,
    });
    const expected = (500_000 / 1e6) * 0.1 + (400_000 / 1e6) * 0.01 + (100_000 / 1e6) * 0.125;
    expect(cost).toBeCloseTo(expected, 8);
  });

  it("prices the agent at gpt-6.2-sol short-context rates", () => {
    const cost = agentCostUsd({
      inputTokens: 1_000_000,
      cachedTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(12, 8);
  });
});

describe("metrics", () => {
  it("uses the nearest-rank percentile", () => {
    expect(percentile([10, 20, 30, 40], 50)).toBe(20);
    expect(percentile([10, 20, 30, 40], 95)).toBe(40);
  });

  it("rolls category accuracy, cost per thousand, and path mix", () => {
    const row = (correct: boolean, path: "fast" | "slow", cost: number): MetricRow => ({
      categoryCorrect: correct,
      highStakesPredicted: false,
      highStakesLabel: false,
      severityScore: 2,
      severityLabel: 2,
      latencyMs: path === "fast" ? 100 : 4000,
      costUsd: cost,
      path,
      blocked: false,
      simulated: true,
    });
    const metrics = summarize([row(true, "fast", 0.001), row(false, "slow", 0.003)]);
    expect(metrics.simulated).toBe(true);
    expect(metrics.categoryAccuracy).toBe(0.5);
    expect(metrics.fastPathCount).toBe(1);
    expect(metrics.costPerThousandUsd).toBeCloseTo(2, 6);
    expect(metrics.latencyMs.p50).toBe(100);
  });
});
