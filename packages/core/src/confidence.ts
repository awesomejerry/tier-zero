import type { DecisionAnswer, DecisionResult } from "./types.js";

export function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** How sure a yes/no probability is, regardless of which side it falls on. */
export function booleanConfidence(probability: number): number {
  return clamp01(Math.max(probability, 1 - probability));
}

export function answerByName(
  result: DecisionResult,
  name: string,
): DecisionAnswer | undefined {
  return result.answers.find((answer) => answer.name === name);
}

export function predicateProbability(
  result: DecisionResult,
  name: string,
): number | null {
  const answer = answerByName(result, name);
  if (!answer) return null;
  if (answer.type === "refusal") return null;
  if (answer.type !== "predicate") return null;
  return clamp01(answer.probability);
}

export function choiceOf(
  result: DecisionResult,
  name: string,
): { choice: string; confidence: number } | null {
  const answer = answerByName(result, name);
  if (!answer || answer.type !== "choice") return null;
  if (typeof answer.choice !== "string") return null;
  return { choice: answer.choice, confidence: clamp01(answer.confidence) };
}

export function scoreOf(
  result: DecisionResult,
  name: string,
): { score: number; confidence: number } | null {
  const answer = answerByName(result, name);
  if (!answer || answer.type !== "score") return null;
  return { score: answer.score, confidence: clamp01(answer.confidence) };
}

export function hasRefusal(result: DecisionResult, names: readonly string[]): boolean {
  return names.some((name) => {
    const answer = answerByName(result, name);
    return !answer || answer.type === "refusal";
  });
}
