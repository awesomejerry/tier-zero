export interface MetricRow {
  categoryCorrect: boolean;
  highStakesPredicted: boolean;
  highStakesLabel: boolean;
  severityScore: number;
  severityLabel: number;
  latencyMs: number;
  costUsd: number;
  path: "fast" | "slow";
  blocked: boolean;
  simulated: boolean;
}

export interface Metrics {
  simulated: boolean;
  ticketCount: number;
  fastPathCount: number;
  slowPathCount: number;
  blockedCount: number;
  categoryAccuracy: number;
  highStakesRecall: number;
  highStakesPrecision: number;
  severityMae: number;
  latencyMs: { p50: number; p95: number; mean: number };
  totalCostUsd: number;
  costPerThousandUsd: number;
}

export function percentile(sortedAscending: number[], p: number): number {
  if (sortedAscending.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sortedAscending.length);
  const index = Math.min(sortedAscending.length - 1, Math.max(0, rank - 1));
  return sortedAscending[index] ?? 0;
}

export function summarize(rows: MetricRow[]): Metrics {
  const ticketCount = rows.length;
  const latencies = rows.map((row) => row.latencyMs).sort((a, b) => a - b);
  const totalCostUsd = rows.reduce((sum, row) => sum + row.costUsd, 0);
  const stakesLabels = rows.filter((row) => row.highStakesLabel);
  const stakesPredicted = rows.filter((row) => row.highStakesPredicted);
  const truePositives = rows.filter(
    (row) => row.highStakesLabel && row.highStakesPredicted,
  ).length;
  const mean =
    ticketCount === 0
      ? 0
      : latencies.reduce((sum, value) => sum + value, 0) / ticketCount;

  return {
    simulated: rows.some((row) => row.simulated),
    ticketCount,
    fastPathCount: rows.filter((row) => row.path === "fast").length,
    slowPathCount: rows.filter((row) => row.path === "slow").length,
    blockedCount: rows.filter((row) => row.blocked).length,
    categoryAccuracy:
      ticketCount === 0
        ? 0
        : rows.filter((row) => row.categoryCorrect).length / ticketCount,
    highStakesRecall:
      stakesLabels.length === 0 ? 1 : truePositives / stakesLabels.length,
    highStakesPrecision:
      stakesPredicted.length === 0 ? 1 : truePositives / stakesPredicted.length,
    severityMae:
      ticketCount === 0
        ? 0
        : rows.reduce(
            (sum, row) => sum + Math.abs(row.severityScore - row.severityLabel),
            0,
          ) / ticketCount,
    latencyMs: {
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      mean,
    },
    totalCostUsd,
    costPerThousandUsd: ticketCount === 0 ? 0 : (totalCostUsd / ticketCount) * 1000,
  };
}
