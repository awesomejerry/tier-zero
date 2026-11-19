import {
  booleanConfidence,
  choiceOf,
  hasRefusal,
  predicateProbability,
  scoreOf,
} from "./confidence.js";
import { TRIAGE_QUESTION_NAMES } from "./questions.js";
import {
  isCategory,
  type Category,
  type DecisionResult,
} from "./types.js";

export interface RouteOptions {
  /** Fast path requires operational confidence at or above this value. */
  confidenceThreshold: number;
  /** Predicate cutoff. At or above this, the ticket is high stakes and cannot take the fast path. */
  highStakesCutoff?: number;
  legalCutoff?: number;
}

export interface TriageReadout {
  category: Category | null;
  categoryConfidence: number;
  categoryProbabilities: { value: string; probability: number }[];
  severityScore: number | null;
  severityConfidence: number;
  severityProbabilities: { value: number; label: string; probability: number }[];
  isHighStakes: number | null;
  needsAccountLookup: number | null;
  hasLegalThreat: number | null;
  refused: boolean;
  /** Minimum confidence among the answers the fast path would act on. */
  operationalConfidence: number;
}

export interface RouteDecision {
  path: "fast" | "slow";
  reasons: Array<"high_stakes" | "legal_threat" | "low_confidence" | "refusal">;
  confidence: number;
  highStakes: boolean;
  legalThreat: boolean;
  readout: TriageReadout;
}

export function readTriage(result: DecisionResult): TriageReadout {
  const refused = hasRefusal(result, TRIAGE_QUESTION_NAMES);
  const categoryAnswer = result.answers.find(
    (answer) => answer.name === "category" && answer.type === "choice",
  );
  const categoryChoice = choiceOf(result, "category");
  const category = categoryChoice && isCategory(categoryChoice.choice)
    ? categoryChoice.choice
    : null;
  const severity = scoreOf(result, "severity");
  const severityAnswer = result.answers.find(
    (answer) => answer.name === "severity" && answer.type === "score",
  );
  const isHighStakes = predicateProbability(result, "is_high_stakes");
  const needsAccountLookup = predicateProbability(result, "needs_account_lookup");
  const hasLegalThreat = predicateProbability(result, "has_legal_threat");

  const parts: number[] = [];
  if (categoryChoice && category) parts.push(categoryChoice.confidence);
  if (severity) parts.push(severity.confidence);
  if (isHighStakes !== null) parts.push(booleanConfidence(isHighStakes));
  if (hasLegalThreat !== null) parts.push(booleanConfidence(hasLegalThreat));

  return {
    category,
    categoryConfidence: categoryChoice?.confidence ?? 0,
    categoryProbabilities:
      categoryAnswer && categoryAnswer.type === "choice"
        ? categoryAnswer.probabilities.flatMap((entry) =>
            typeof entry.value === "string"
              ? [{ value: entry.value, probability: entry.probability }]
              : [],
          )
        : [],
    severityScore: severity?.score ?? null,
    severityConfidence: severity?.confidence ?? 0,
    severityProbabilities:
      severityAnswer && severityAnswer.type === "score"
        ? severityAnswer.probabilities
        : [],
    isHighStakes,
    needsAccountLookup,
    hasLegalThreat,
    refused,
    operationalConfidence: parts.length === 0 ? 0 : Math.min(...parts),
  };
}

/**
 * Fast path only when we are confident and the ticket is not high stakes.
 * High-stakes and legal-threat gates do not move with the confidence slider.
 */
export function routeTicket(
  result: DecisionResult,
  options: RouteOptions,
): RouteDecision {
  const readout = readTriage(result);
  const highStakesCutoff = options.highStakesCutoff ?? 0.5;
  const legalCutoff = options.legalCutoff ?? 0.5;
  const reasons: RouteDecision["reasons"] = [];

  if (readout.refused || readout.category === null || readout.severityScore === null) {
    reasons.push("refusal");
  }

  const highStakes = (readout.isHighStakes ?? 1) >= highStakesCutoff;
  const legalThreat = (readout.hasLegalThreat ?? 1) >= legalCutoff;
  if (highStakes) reasons.push("high_stakes");
  if (legalThreat) reasons.push("legal_threat");
  if (readout.operationalConfidence < options.confidenceThreshold) {
    reasons.push("low_confidence");
  }

  return {
    path: reasons.length === 0 ? "fast" : "slow",
    reasons,
    confidence: readout.operationalConfidence,
    highStakes,
    legalThreat,
    readout,
  };
}
