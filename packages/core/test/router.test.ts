import { describe, expect, it } from "vitest";
import {
  routeTicket,
  type DecisionAnswer,
  type DecisionResult,
} from "@tier-zero/core";

function result(answers: DecisionAnswer[]): DecisionResult {
  return {
    model: "fixture",
    answers,
    usage: { inputTokens: 10, cachedTokens: 0, cacheWriteTokens: 0, outputTokens: 0 },
    latencyMs: 20,
    simulated: true,
  };
}

function answers(confidence: number, stakes = 0.02, legal = 0.02): DecisionAnswer[] {
  return [
    {
      type: "choice",
      name: "category",
      choice: "billing",
      confidence,
      probabilities: [
        { value: "billing", probability: confidence },
        { value: "shipping", probability: 1 - confidence },
      ],
    },
    {
      type: "score",
      name: "severity",
      score: 2,
      confidence: 0.99,
      probabilities: [{ value: 2, label: "medium", probability: 0.99 }],
    },
    { type: "predicate", name: "is_high_stakes", probability: stakes },
    { type: "predicate", name: "needs_account_lookup", probability: 0.9 },
    { type: "predicate", name: "has_legal_threat", probability: legal },
  ];
}

describe("routeTicket", () => {
  it("takes the fast path when confidence clears the threshold and stakes are low", () => {
    const decision = routeTicket(result(answers(0.91)), { confidenceThreshold: 0.8 });
    expect(decision.path).toBe("fast");
    expect(decision.reasons).toEqual([]);
    expect(decision.readout.category).toBe("billing");
  });

  it("treats the threshold as inclusive", () => {
    const decision = routeTicket(result(answers(0.8)), { confidenceThreshold: 0.8 });
    expect(decision.path).toBe("fast");
  });

  it("escalates when confidence is below the threshold", () => {
    const decision = routeTicket(result(answers(0.79)), { confidenceThreshold: 0.8 });
    expect(decision.path).toBe("slow");
    expect(decision.reasons).toContain("low_confidence");
  });

  it("escalates high-stakes tickets no matter how confident the category is", () => {
    const decision = routeTicket(result(answers(0.99, 0.5, 0.02)), {
      confidenceThreshold: 0.5,
    });
    expect(decision.path).toBe("slow");
    expect(decision.highStakes).toBe(true);
    expect(decision.reasons).toContain("high_stakes");
  });

  it("does not flag 0.49 as high stakes, but uncertainty still blocks a high threshold", () => {
    const decision = routeTicket(result(answers(0.95, 0.49, 0.02)), {
      confidenceThreshold: 0.8,
    });
    expect(decision.highStakes).toBe(false);
    expect(decision.path).toBe("slow");
    expect(decision.reasons).toEqual(["low_confidence"]);
    const relaxed = routeTicket(result(answers(0.95, 0.49, 0.02)), {
      confidenceThreshold: 0.5,
    });
    expect(relaxed.path).toBe("fast");
  });

  it("escalates legal threats even when the rest of the readout is confident", () => {
    const decision = routeTicket(result(answers(0.99, 0.02, 0.9)), {
      confidenceThreshold: 0.5,
    });
    expect(decision.path).toBe("slow");
    expect(decision.legalThreat).toBe(true);
    expect(decision.reasons).toContain("legal_threat");
  });

  it("escalates when a required answer is a refusal", () => {
    const decision = routeTicket(
      result([
        { type: "refusal", name: "category" },
        {
          type: "score",
          name: "severity",
          score: 1,
          confidence: 0.9,
          probabilities: [],
        },
        { type: "predicate", name: "is_high_stakes", probability: 0.01 },
        { type: "predicate", name: "needs_account_lookup", probability: 0.2 },
        { type: "predicate", name: "has_legal_threat", probability: 0.01 },
      ]),
      { confidenceThreshold: 0.5 },
    );
    expect(decision.path).toBe("slow");
    expect(decision.reasons).toContain("refusal");
  });
});
