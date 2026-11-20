import {
  estimateTokens,
  type DecisionRequest,
  type DecisionResult,
  type SystemOneProvider,
} from "@tier-zero/core";
import { heuristicAnswers, inputToText } from "./heuristic.js";
import { simulatedDecisionLatency } from "./hash.js";

/**
 * Deterministic System One. Same ticket, same answers, no network.
 * Latency and token counts are simulated from the published Decisions shape.
 */
export class MockSystemOneProvider implements SystemOneProvider {
  readonly id = "mock";
  readonly simulated = true;

  async decide(request: DecisionRequest): Promise<DecisionResult> {
    if (request.questions.length === 0) {
      throw new Error("Decisions requests need at least one question.");
    }
    if (request.questions.length > 400) {
      throw new Error("Decisions requests accept at most 400 questions.");
    }
    const names = new Set<string>();
    for (const question of request.questions) {
      if (names.has(question.name)) {
        throw new Error(`Duplicate question name: ${question.name}`);
      }
      names.add(question.name);
    }

    const text = inputToText(request.input);
    const questionText = JSON.stringify(request.questions);
    return {
      model: "mock-system-one",
      answers: heuristicAnswers(request),
      usage: {
        inputTokens: estimateTokens(`${text}\n${questionText}`),
        cachedTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: 0,
      },
      latencyMs: simulatedDecisionLatency(`${text.slice(0, 180)}:${request.questions.length}`),
      simulated: true,
    };
  }
}
