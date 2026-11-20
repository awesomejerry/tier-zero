import { readFileSync, writeFileSync } from "node:fs";
import {
  DEFAULT_THRESHOLDS,
  PRICE_TABLE,
  evaluatePrepared,
  prepareCases,
  sweepThresholds,
  type Metrics,
} from "@tier-zero/core";
import { DATASET_SEED, cases } from "@tier-zero/dataset";
import { createSystemOne, createSystemTwo, type ProviderKind } from "@tier-zero/providers";
import { CHART_DISCLAIMER, renderChart } from "./chart.js";

const DISCLAIMER =
  "MOCK / SIMULATED. Latency is drawn from a fixed distribution. Decisions come from the heuristic and the scripted agent, not from gpt-6-luna or gpt-6.2-sol. Do not cite these numbers as API measurements. Re-run with `pnpm benchmark --live` once OPENAI_API_KEY is set.";

function round(value: number, digits: number): number {
  return Number(value.toFixed(digits));
}

function roundMetrics(metrics: Metrics): Metrics {
  return {
    ...metrics,
    categoryAccuracy: round(metrics.categoryAccuracy, 4),
    highStakesRecall: round(metrics.highStakesRecall, 4),
    highStakesPrecision: round(metrics.highStakesPrecision, 4),
    severityMae: round(metrics.severityMae, 4),
    latencyMs: {
      p50: Math.round(metrics.latencyMs.p50),
      p95: Math.round(metrics.latencyMs.p95),
      mean: Math.round(metrics.latencyMs.mean),
    },
    totalCostUsd: round(metrics.totalCostUsd, 6),
    costPerThousandUsd: round(metrics.costPerThousandUsd, 4),
  };
}

async function main(): Promise<void> {
  const live = process.argv.includes("--live");
  const check = process.argv.includes("--check");
  if (live && check) {
    throw new Error("--check compares the committed mock run. It cannot be combined with --live.");
  }
  const kind: ProviderKind = live ? "openai" : "mock";
  if (live && !process.env.OPENAI_API_KEY) {
    throw new Error("Set OPENAI_API_KEY before `pnpm benchmark --live`.");
  }

  const systemOne = createSystemOne(kind);
  const systemTwo = createSystemTwo(kind);
  const prepared = await prepareCases(cases, systemOne, systemTwo);
  const thresholds = [...DEFAULT_THRESHOLDS];
  const points = sweepThresholds(prepared, thresholds).map((point) => ({
    threshold: point.threshold,
    fastPathShare: round(point.fastPathShare, 4),
    tierZeroAccuracy: round(point.tierZeroAccuracy, 4),
    tierZeroP50Ms: Math.round(point.tierZeroP50Ms),
    tierZeroP95Ms: Math.round(point.tierZeroP95Ms),
    tierZeroCostPerThousandUsd: round(point.tierZeroCostPerThousandUsd, 4),
    baselineAccuracy: round(point.baselineAccuracy, 4),
    baselineP50Ms: Math.round(point.baselineP50Ms),
    baselineP95Ms: Math.round(point.baselineP95Ms),
    baselineCostPerThousandUsd: round(point.baselineCostPerThousandUsd, 4),
  }));
  const atDefault = evaluatePrepared(prepared, 0.8);
  const results = {
    mode: live ? "live" : "mock",
    simulated: !live,
    disclaimer: live
      ? "Live run against the OpenAI APIs configured in the environment. Confirm the model names before quoting these numbers."
      : DISCLAIMER,
    seed: DATASET_SEED,
    tickets: cases.length,
    defaultThreshold: 0.8,
    prices: PRICE_TABLE,
    points,
    atDefault: {
      tierZero: roundMetrics(atDefault.tierZero),
      llmOnly: roundMetrics(atDefault.llmOnly),
    },
  };
  const chart = renderChart(points);
  const resultsPath = new URL("../../../benchmarks/results.json", import.meta.url);
  const chartPath = new URL("../../../benchmarks/chart.svg", import.meta.url);

  if (check) {
    const committedResults = readFileSync(resultsPath, "utf8");
    const committedChart = readFileSync(chartPath, "utf8");
    const nextResults = `${JSON.stringify(results, null, 2)}\n`;
    if (committedResults !== nextResults || committedChart !== chart) {
      throw new Error(
        "Committed benchmark outputs drifted. Run `pnpm benchmark` and commit benchmarks/results.json and benchmarks/chart.svg.",
      );
    }
    console.log("Benchmark outputs match the committed mock run.");
    return;
  }

  writeFileSync(resultsPath, `${JSON.stringify(results, null, 2)}\n`);
  writeFileSync(chartPath, chart);
  console.log(
    `${results.mode} benchmark wrote ${results.tickets} tickets across ${points.length} thresholds.`,
  );
  console.log(results.disclaimer);
  console.log(CHART_DISCLAIMER);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
