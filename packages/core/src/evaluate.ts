import { runSlowPath, type SlowPathResult } from "./agent.js";
import { fastPathResolution } from "./fast-path.js";
import { summarize, type MetricRow, type Metrics } from "./metrics.js";
import { decisionsCostUsd } from "./pricing.js";
import { readTriage, routeTicket, type RouteDecision, type TriageReadout } from "./router.js";
import { triageQuestions } from "./questions.js";
import {
  ticketText,
  type DecisionResult,
  type SupportCase,
  type SystemOneProvider,
  type SystemTwoProvider,
} from "./types.js";

export interface PreparedCase {
  supportCase: SupportCase;
  triage: DecisionResult;
  readout: TriageReadout;
  triageLatencyMs: number;
  triageCostUsd: number;
  slow: SlowPathResult;
}

export interface EvaluatedCase {
  prepared: PreparedCase;
  route: RouteDecision;
  predictedCategory: string;
  reply: string;
  queue: string;
  priority: string;
  tags: string[];
  tierZero: MetricRow;
  llmOnly: MetricRow;
}

export interface Comparison {
  threshold: number;
  tierZero: Metrics;
  llmOnly: Metrics;
  cases: EvaluatedCase[];
}

export interface SweepPoint {
  threshold: number;
  fastPathShare: number;
  tierZeroAccuracy: number;
  tierZeroP50Ms: number;
  tierZeroP95Ms: number;
  tierZeroCostPerThousandUsd: number;
  baselineAccuracy: number;
  baselineP50Ms: number;
  baselineP95Ms: number;
  baselineCostPerThousandUsd: number;
}

export async function prepareCase(
  supportCase: SupportCase,
  systemOne: SystemOneProvider,
  systemTwo: SystemTwoProvider,
): Promise<PreparedCase> {
  const triage = await systemOne.decide({
    input: ticketText(supportCase.ticket),
    questions: triageQuestions(),
    promptCacheKey: "harbor-triage",
  });
  const readout = readTriage(triage);
  const slow = await runSlowPath({
    supportCase,
    fallbackCategory: readout.category ?? "other",
    systemOne,
    systemTwo,
  });
  return {
    supportCase,
    triage,
    readout,
    triageLatencyMs: triage.latencyMs,
    triageCostUsd: decisionsCostUsd(triage.usage),
    slow,
  };
}

export async function prepareCases(
  cases: SupportCase[],
  systemOne: SystemOneProvider,
  systemTwo: SystemTwoProvider,
): Promise<PreparedCase[]> {
  const prepared: PreparedCase[] = [];
  for (const supportCase of cases) {
    prepared.push(await prepareCase(supportCase, systemOne, systemTwo));
  }
  return prepared;
}

export function evaluatePrepared(
  prepared: PreparedCase[],
  threshold: number,
): Comparison {
  const cases = prepared.map((item) => evaluateOne(item, threshold));
  return {
    threshold,
    tierZero: summarize(cases.map((item) => item.tierZero)),
    llmOnly: summarize(cases.map((item) => item.llmOnly)),
    cases,
  };
}

function evaluateOne(prepared: PreparedCase, threshold: number): EvaluatedCase {
  const route = routeTicket(prepared.triage, { confidenceThreshold: threshold });
  const label = prepared.supportCase.label;
  const fast = fastPathResolution(prepared.supportCase.ticket, route.readout);
  const slow = prepared.slow;
  const predictedCategory = route.path === "fast" ? fast.category : slow.category;
  const simulated = prepared.triage.simulated || slow.simulated;
  const highStakesPredicted = route.highStakes || route.legalThreat;

  const tierZero: MetricRow = {
    categoryCorrect: predictedCategory === label.category,
    highStakesPredicted,
    highStakesLabel: label.isHighStakes,
    severityScore: route.readout.severityScore ?? 0,
    severityLabel: label.severityIndex,
    latencyMs:
      route.path === "fast"
        ? prepared.triageLatencyMs
        : prepared.triageLatencyMs + slow.agentLatencyMs + slow.guardrailLatencyMs,
    costUsd:
      route.path === "fast"
        ? prepared.triageCostUsd
        : prepared.triageCostUsd + slow.agentCostUsd + slow.guardrailCostUsd,
    path: route.path,
    blocked: route.path === "slow" && slow.blockedCount > 0,
    simulated,
  };

  const llmOnly: MetricRow = {
    categoryCorrect: slow.category === label.category,
    highStakesPredicted,
    highStakesLabel: label.isHighStakes,
    severityScore: route.readout.severityScore ?? 0,
    severityLabel: label.severityIndex,
    latencyMs: slow.agentLatencyMs,
    costUsd: slow.agentCostUsd,
    path: "slow",
    blocked: false,
    simulated,
  };

  return {
    prepared,
    route,
    predictedCategory,
    reply: route.path === "fast" ? fast.reply : slow.reply,
    queue: route.path === "fast" ? fast.queue : slow.queue,
    priority: route.path === "fast" ? fast.priority : slow.priority,
    tags: route.path === "fast" ? fast.tags : [slow.category, `priority:${slow.priority}`, "path:slow"],
    tierZero,
    llmOnly,
  };
}

export function sweepThresholds(
  prepared: PreparedCase[],
  thresholds: number[],
): SweepPoint[] {
  return thresholds.map((threshold) => {
    const comparison = evaluatePrepared(prepared, threshold);
    const count = comparison.tierZero.ticketCount || 1;
    return {
      threshold,
      fastPathShare: comparison.tierZero.fastPathCount / count,
      tierZeroAccuracy: comparison.tierZero.categoryAccuracy,
      tierZeroP50Ms: comparison.tierZero.latencyMs.p50,
      tierZeroP95Ms: comparison.tierZero.latencyMs.p95,
      tierZeroCostPerThousandUsd: comparison.tierZero.costPerThousandUsd,
      baselineAccuracy: comparison.llmOnly.categoryAccuracy,
      baselineP50Ms: comparison.llmOnly.latencyMs.p50,
      baselineP95Ms: comparison.llmOnly.latencyMs.p95,
      baselineCostPerThousandUsd: comparison.llmOnly.costPerThousandUsd,
    };
  });
}

export const DEFAULT_THRESHOLDS = [
  0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 0.98,
] as const;
