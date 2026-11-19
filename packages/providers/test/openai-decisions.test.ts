import { describe, expect, it } from "vitest";
import { triageQuestions } from "@tier-zero/core";
import {
  JevNotAvailableError,
  JevSystemOneProvider,
  OpenAIDecisionsProvider,
  mapQuestion,
  parseDecisionResponse,
  parseResponsesBody,
} from "@tier-zero/providers";

describe("OpenAI Decisions adapter", () => {
  it("posts the documented request shape to /v1/decisions", async () => {
    let url = "";
    let body: Record<string, unknown> = {};
    const fetchImpl: typeof fetch = async (input, init) => {
      url = String(input);
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const payload = {
        model: "gpt-6-luna",
        answers: [
          { type: "predicate", name: "is_high_stakes", probability: 0.04 },
          {
            type: "choice",
            name: "category",
            choice: "billing",
            confidence: 0.93,
            probabilities: [
              { value: "billing", probability: 0.95 },
              { value: "other", probability: 0.05 },
            ],
          },
          {
            type: "score",
            name: "severity",
            score: 1.1,
            confidence: 0.55,
            probabilities: [
              { value: 0, label: "informational", probability: 0.1 },
              { value: 1, label: "low", probability: 0.7 },
              { value: 2, label: "medium", probability: 0.2 },
            ],
          },
          { type: "refusal", name: "needs_account_lookup" },
        ],
        usage: {
          input_tokens: 42,
          input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
          output_tokens: 0,
          output_tokens_details: { reasoning_tokens: 0 },
          total_tokens: 42,
        },
      };
      return new Response(JSON.stringify(payload), { status: 200 });
    };

    const provider = new OpenAIDecisionsProvider({
      apiKey: "sk-test",
      fetch: fetchImpl,
    });
    const decision = await provider.decide({
      input: [
        { type: "message", role: "user", content: "I was charged twice." },
        {
          type: "function_call",
          callId: "call_refund",
          name: "issue_refund",
          arguments: "{\"amountCents\":1200}",
        },
      ],
      questions: triageQuestions().slice(0, 4),
      promptCacheKey: "harbor-triage",
    });

    expect(url).toBe("https://api.openai.com/v1/decisions");
    expect(body.model).toBe("gpt-6-luna");
    expect(body.prompt_cache_key).toBe("harbor-triage");
    const input = body.input as Record<string, unknown>[];
    expect(input[1]).toMatchObject({
      type: "function_call",
      call_id: "call_refund",
      name: "issue_refund",
    });
    const questions = body.questions as Record<string, unknown>[];
    expect(questions.map((question) => question.type)).toEqual([
      "choice",
      "score",
      "predicate",
      "predicate",
    ]);
    const category = questions[0];
    expect(category?.name).toBe("category");
    expect(Array.isArray(category?.choices)).toBe(true);
    expect(decision.simulated).toBe(false);
    expect(decision.usage.inputTokens).toBe(42);
    expect(decision.usage.outputTokens).toBe(0);
    expect(decision.answers.find((answer) => answer.name === "needs_account_lookup")?.type).toBe(
      "refusal",
    );
    const choice = decision.answers.find((answer) => answer.name === "category");
    expect(choice && choice.type === "choice" ? choice.choice : null).toBe("billing");
    const score = decision.answers.find((answer) => answer.name === "severity");
    expect(score && score.type === "score" ? score.score : null).toBe(1.1);
  });

  it("maps a score question with levels and descriptions", () => {
    const [severity] = triageQuestions().filter((question) => question.name === "severity");
    if (!severity) throw new Error("missing severity question");
    const mapped = mapQuestion(severity);
    expect(mapped.type).toBe("score");
    const levels = mapped.levels as { label: string; description?: string }[];
    expect(levels).toHaveLength(5);
    expect(levels[0]?.label).toBe("informational");
    expect(levels[0]?.description).toBeTruthy();
  });

  it("rejects a non-object payload", () => {
    expect(() => parseDecisionResponse("nope", 1)).toThrow(/object/);
  });
});

describe("OpenAI Responses adapter", () => {
  it("reads function calls, reasoning summaries, and usage", () => {
    const turn = parseResponsesBody(
      {
        model: "gpt-6.2-sol",
        output: [
          {
            type: "reasoning",
            summary: [{ type: "summary_text", text: "Check the order before refunding." }],
          },
          {
            type: "function_call",
            call_id: "call_lookup",
            name: "lookup_order",
            arguments: "{\"orderId\":\"HBR-15\"}",
          },
        ],
        usage: {
          input_tokens: 800,
          output_tokens: 120,
          input_tokens_details: { cached_tokens: 100 },
        },
      },
      1800,
      "gpt-6.2-sol",
    );
    expect(turn.simulated).toBe(false);
    expect(turn.reasoning).toContain("Check the order");
    expect(turn.toolCalls[0]?.name).toBe("lookup_order");
    expect(turn.toolCalls[0]?.arguments.orderId).toBe("HBR-15");
    expect(turn.usage.cachedTokens).toBe(100);
    expect(turn.latencyMs).toBe(1800);
  });
});

describe("Jev adapter", () => {
  it("fails closed with a TODO until early access exists", async () => {
    const provider = new JevSystemOneProvider();
    await expect(provider.decide({ input: "hello", questions: [] })).rejects.toBeInstanceOf(
      JevNotAvailableError,
    );
  });
});
