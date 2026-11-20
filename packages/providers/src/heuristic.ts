import {
  CATEGORIES,
  type Category,
  type DecisionAnswer,
  type DecisionInput,
  type DecisionQuestion,
  type DecisionRequest,
} from "@tier-zero/core";
import { unitInterval } from "./hash.js";

/**
 * Bag-of-words stand-in for a System One model.
 *
 * The synthetic dataset is written against this same lexicon, so the demo and
 * the benchmark move together. A live provider ignores this file and sends the
 * question instructions to the model instead.
 */
export const CATEGORY_PATTERNS: Record<Category, RegExp[]> = {
  billing: [
    /\bcharg(?:e|ed|es|ing)\b/i,
    /\binvoice\b/i,
    /\brefund\b/i,
    /\bpayment\b/i,
    /\bduplicate\b/i,
    /\bsubscription\b/i,
    /\bpayout\b/i,
    /\breceipt\b/i,
  ],
  shipping: [
    /\btracking\b/i,
    /\bpackage\b/i,
    /\bdelivery\b/i,
    /\bshipped\b/i,
    /\bcarrier\b/i,
    /\bwarehouse\b/i,
    /\btransit\b/i,
  ],
  technical: [
    /\berror\b/i,
    /\bapi\b/i,
    /\bwebhook\b/i,
    /\btimeout\b/i,
    /\bdashboard\b/i,
    /\bbug\b/i,
    /\bexport\b/i,
    /\blogin\b/i,
  ],
  account: [
    /\bpassword\b/i,
    /\btwo-factor\b/i,
    /\bdeactivate\b/i,
    /\bsso\b/i,
    /\bteammate\b/i,
    /\busername\b/i,
  ],
  returns: [
    /\breturn label\b/i,
    /\bexchange\b/i,
    /\brma\b/i,
    /\bunworn\b/i,
    /\brestocking\b/i,
  ],
  other: [
    /\boffice hours\b/i,
    /\breferral\b/i,
    /\bwholesale catalog\b/i,
    /\bcompliment\b/i,
    /\bpartnership\b/i,
  ],
};

const LEGAL_PATTERN =
  /\battorney\b|\blawyer\b|\blawsuit\b|\blegal action\b|\bchargeback\b|\bregulator\b|\bsue\b/i;
const STAKES_PATTERN =
  /\battorney\b|\blawyer\b|\blawsuit\b|\blegal action\b|\bchargeback\b|\bregulator\b|\bsue\b|\bdata breach\b|\baccount takeover\b|\bproduction is down\b|\bevery merchant\b/i;

const PRIOR = 0.25;
const TEMPERATURE = 0.95;

export function inputToText(input: DecisionInput): string {
  if (typeof input === "string") return input;
  return input
    .map((item) => {
      if (item.type === "message") return item.content;
      if (item.type === "function_call") {
        return `FUNCTION_CALL ${item.name} ${item.arguments}`;
      }
      return item.output;
    })
    .join("\n");
}

export function patternHits(text: string, patterns: RegExp[]): string[] {
  return patterns.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source);
}

export function categoryScores(text: string): Record<Category, number> {
  const scores = {} as Record<Category, number>;
  for (const category of CATEGORIES) {
    scores[category] = PRIOR + patternHits(text, CATEGORY_PATTERNS[category]).length;
  }
  return scores;
}

export function softmax(scores: number[], temperature: number): number[] {
  const scaled = scores.map((score) => score / temperature);
  const max = Math.max(...scaled);
  const exps = scaled.map((score) => Math.exp(score - max));
  const sum = exps.reduce((total, value) => total + value, 0);
  return exps.map((value) => value / sum);
}

export interface CategoryScore {
  category: Category;
  probability: number;
  hits: number;
}

export function rankCategories(text: string): CategoryScore[] {
  const scores = categoryScores(text);
  const probabilities = softmax(
    CATEGORIES.map((category) => scores[category]),
    TEMPERATURE,
  );
  const ranked = CATEGORIES.map((category, index) => ({
    category,
    probability: probabilities[index] ?? 0,
    hits: scores[category] - PRIOR,
  }));
  return spreadTop(ranked, text).sort((a, b) => b.probability - a.probability);
}

/**
 * Tickets that share a template would otherwise share one probability.
 * A seeded nudge of ±0.02 keeps the winner and gives the threshold slider
 * a range to travel through. It is not model calibration.
 */
function spreadTop(ranked: CategoryScore[], seed: string): CategoryScore[] {
  const top = ranked.reduce((best, entry) => (entry.probability > best.probability ? entry : best));
  const second = ranked.reduce(
    (best, entry) =>
      entry.category === top.category || entry.probability < best ? best : entry.probability,
    0,
  );
  const nudge = (unitInterval(`spread:${seed}`) - 0.5) * 0.04;
  const target = Math.min(0.99, Math.max(second + 0.03, top.probability + nudge));
  const others = 1 - top.probability;
  const rest = 1 - target;
  return ranked.map((entry) => {
    if (entry.category === top.category) return { ...entry, probability: target };
    const probability = others === 0 ? rest / (ranked.length - 1) : (entry.probability / others) * rest;
    return { ...entry, probability };
  });
}

function peaked(activeIndex: number, size: number, peak: number): number[] {
  const rest = (1 - peak) / (size - 1);
  return Array.from({ length: size }, (_, index) => (index === activeIndex ? peak : rest));
}

function severityIndex(text: string): number {
  if (STAKES_PATTERN.test(text)) return 4;
  if (/\bcannot\b|\bduplicate\b|\blocked out\b|\bpast due\b/i.test(text)) return 3;
  if (
    /\boffice hours\b|\breferral\b|\bcompliment\b|\bwholesale catalog\b|\bpartnership\b/i.test(
      text,
    )
  ) {
    return 0;
  }
  if (/\bunworn\b|\bexchange\b/i.test(text)) return 1;
  return 2;
}

function replySection(text: string): string {
  const marker = "REPLY\n";
  const index = text.lastIndexOf(marker);
  if (index === -1) return "";
  return text.slice(index + marker.length);
}

function toolName(text: string): string | null {
  return text.match(/\bTOOL\s+([a-z_]+)/)?.[1] ?? null;
}

function withinPolicy(text: string): number {
  const tool = toolName(text);
  if (!tool) return 0.42;
  if (
    tool === "lookup_order" ||
    tool === "lookup_customer" ||
    tool === "check_refund_policy" ||
    tool === "escalate_to_human" ||
    tool === "propose_resolution"
  ) {
    return 0.97;
  }
  if (tool !== "issue_refund") return 0.35;
  const amount = Number(text.match(/"amountCents":\s*(\d+)/)?.[1] ?? "0");
  const cap = Number(text.match(/autoRefundCapCents=(\d+)/)?.[1] ?? "5000");
  if (amount > cap) return 0.05;
  if (/"refundEligible":false/.test(text)) return 0.08;
  if (/"refundEligible":true/.test(text)) return 0.95;
  return 0.52;
}

function requiresHuman(text: string): number {
  const tool = toolName(text);
  if (tool === "issue_refund" && STAKES_PATTERN.test(text)) return 0.91;
  return 0.07;
}

function promisesUnsupported(text: string): number {
  const reply = replySection(text);
  if (/\bguarantee\b/i.test(reply) || /\bi(?:'ve| have) refunded\b/i.test(reply)) return 0.94;
  return 0.05;
}

function disclosesInternal(text: string): number {
  const reply = replySection(text);
  if (/auto-refund cap|\binternal note\b|\bsystem prompt\b/i.test(reply)) return 0.93;
  return 0.04;
}

function admitsLiability(text: string): number {
  const reply = replySection(text);
  if (/\bwe admit\b|\blegally liable\b|\bour fault under the law\b/i.test(reply)) return 0.92;
  return 0.04;
}

function predicate(name: string, probability: number): DecisionAnswer {
  return { type: "predicate", name, probability };
}

function answerQuestion(question: DecisionQuestion, text: string): DecisionAnswer {
  if (question.type === "predicate") {
    switch (question.name) {
      case "is_high_stakes":
        return predicate(question.name, STAKES_PATTERN.test(text) ? 0.96 : 0.01);
      case "has_legal_threat":
        return predicate(question.name, LEGAL_PATTERN.test(text) ? 0.95 : 0.01);
      case "needs_account_lookup": {
        const needs =
          /\bHBR-\d+\b/.test(text) ||
          /\bpassword\b|\brefund\b|\btracking\b|\btwo-factor\b|\bduplicate\b/i.test(text);
        return predicate(question.name, needs ? 0.92 : 0.14);
      }
      case "within_policy":
        return predicate(question.name, withinPolicy(text));
      case "requires_human":
        return predicate(question.name, requiresHuman(text));
      case "promises_unsupported":
        return predicate(question.name, promisesUnsupported(text));
      case "discloses_internal":
        return predicate(question.name, disclosesInternal(text));
      case "admits_liability":
        return predicate(question.name, admitsLiability(text));
      default:
        return { type: "refusal", name: question.name };
    }
  }

  if (question.type === "choice" && question.name === "category") {
    const ranked = rankCategories(text);
    const top = ranked[0];
    if (!top) return { type: "refusal", name: question.name };
    return {
      type: "choice",
      name: question.name,
      choice: top.category,
      confidence: top.probability,
      probabilities: ranked
        .slice()
        .sort((a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category))
        .map((entry) => ({ value: entry.category, probability: entry.probability })),
    };
  }

  if (question.type === "score" && question.name === "severity") {
    const index = Math.min(severityIndex(text), question.levels.length - 1);
    const probabilities = peaked(index, question.levels.length, 0.99);
    const score = probabilities.reduce((sum, probability, level) => sum + probability * level, 0);
    return {
      type: "score",
      name: question.name,
      score,
      confidence: 0.99,
      probabilities: question.levels.map((level, levelIndex) => ({
        value: levelIndex,
        label: level.label,
        probability: probabilities[levelIndex] ?? 0,
      })),
    };
  }

  if (question.type === "choice") {
    const first = question.choices[0];
    if (!first) return { type: "refusal", name: question.name };
    return {
      type: "choice",
      name: question.name,
      choice: first.value,
      confidence: 1 / question.choices.length,
      probabilities: question.choices.map((choice) => ({
        value: choice.value,
        probability: 1 / question.choices.length,
      })),
    };
  }

  const probabilities = peaked(0, question.levels.length, 0.5);
  return {
    type: "score",
    name: question.name,
    score: probabilities.reduce((sum, probability, level) => sum + probability * level, 0),
    confidence: 0.5,
    probabilities: question.levels.map((level, levelIndex) => ({
      value: levelIndex,
      label: level.label,
      probability: probabilities[levelIndex] ?? 0,
    })),
  };
}

export function heuristicAnswers(request: DecisionRequest): DecisionAnswer[] {
  const text = inputToText(request.input);
  return request.questions.map((question) => answerQuestion(question, text));
}

export function topCategory(text: string): { category: Category; confidence: number } {
  const ranked = rankCategories(text);
  const top = ranked[0];
  if (!top) return { category: "other", confidence: 0 };
  return { category: top.category, confidence: top.probability };
}
