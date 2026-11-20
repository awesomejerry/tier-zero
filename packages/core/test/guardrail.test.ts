import { describe, expect, it } from "vitest";
import {
  HARBOR_POLICY,
  createCaseTools,
  reviewReply,
  reviewToolCall,
  type DecisionRequest,
  type DecisionResult,
  type SupportCase,
  type SystemOneProvider,
} from "@tier-zero/core";

function provider(probabilities: Record<string, number>): SystemOneProvider {
  return {
    id: "stub",
    simulated: true,
    async decide(request: DecisionRequest): Promise<DecisionResult> {
      return {
        model: "stub",
        simulated: true,
        latencyMs: 5,
        usage: { inputTokens: 20, cachedTokens: 0, cacheWriteTokens: 0, outputTokens: 0 },
        answers: request.questions.map((question) => ({
          type: "predicate" as const,
          name: question.name,
          probability: probabilities[question.name] ?? 0,
        })),
      };
    },
  };
}

const base = {
  ticketText: "Customer: Ada Lovelace <ada@example.com>\nSubject: Duplicate invoice",
  orderSummary: JSON.stringify({ refundEligible: true, amountCents: 12900 }),
};

describe("guardrail", () => {
  it("blocks a refund the policy predicate rejects", async () => {
    const verdict = await reviewToolCall(provider({ within_policy: 0.05, requires_human: 0.1 }), {
      ...base,
      call: {
        name: "issue_refund",
        callId: "call_1",
        arguments: { orderId: "HBR-1", amountCents: 12900, reason: "duplicate" },
      },
    });
    expect(verdict.action).toBe("block");
    expect(verdict.reasons).toContain("outside_policy");
  });

  it("blocks a refund that needs a human even when the amount looks allowed", async () => {
    const verdict = await reviewToolCall(provider({ within_policy: 0.92, requires_human: 0.9 }), {
      ...base,
      call: {
        name: "issue_refund",
        callId: "call_2",
        arguments: { orderId: "HBR-1", amountCents: 1800, reason: "duplicate" },
      },
    });
    expect(verdict.action).toBe("block");
    expect(verdict.reasons).toContain("needs_human_approval");
  });

  it("allows a lookup and an in-policy refund", async () => {
    const system = provider({ within_policy: 0.96, requires_human: 0.05 });
    const lookup = await reviewToolCall(system, {
      ...base,
      call: { name: "lookup_order", callId: "call_3", arguments: { orderId: "HBR-1" } },
    });
    const refund = await reviewToolCall(system, {
      ...base,
      call: {
        name: "issue_refund",
        callId: "call_4",
        arguments: { orderId: "HBR-1", amountCents: 2400, reason: "duplicate" },
      },
    });
    expect(lookup.action).toBe("allow");
    expect(refund.action).toBe("allow");
  });

  it("blocks a reply that promises something unsupported", async () => {
    const verdict = await reviewReply(
      provider({ promises_unsupported: 0.94, discloses_internal: 0.04, admits_liability: 0.04 }),
      { ...base, reply: "I guarantee this will never happen again." },
    );
    expect(verdict.action).toBe("block");
    expect(verdict.reasons).toContain("promises_unsupported");
  });

  it("allows an ordinary reply", async () => {
    const verdict = await reviewReply(
      provider({ promises_unsupported: 0.05, discloses_internal: 0.04, admits_liability: 0.04 }),
      { ...base, reply: "A specialist will follow up on the shipment." },
    );
    expect(verdict.action).toBe("allow");
  });
});

describe("tool defense in depth", () => {
  const supportCase = {
    ticket: {
      id: "tkt_test",
      receivedAt: "2026-11-18T00:00:00.000Z",
      channel: "email",
      subject: "Duplicate",
      body: "Please refund it.",
      customer: { name: "Ada Lovelace", email: "ada@example.com", plan: "pro" },
      orderId: "HBR-1",
    },
    order: {
      orderId: "HBR-1",
      product: "Cedar kettle",
      amountCents: 12900,
      placedAt: "2026-11-01T00:00:00.000Z",
      daysSincePurchase: 4,
      fulfillmentStatus: "delivered",
      issueCategory: "billing",
      duplicateCharge: true,
      refundEligible: true,
      crmAgreesWithLabel: true,
    },
    customer: {
      email: "ada@example.com",
      name: "Ada Lovelace",
      plan: "pro",
      accountStatus: "active",
      issueCategory: "billing",
    },
    label: {
      category: "billing",
      severityIndex: 3,
      isHighStakes: false,
      needsAccountLookup: true,
      hasLegalThreat: false,
    },
    generator: {
      cohort: "borderline",
      scenarioId: "test",
      confusedAs: null,
      guaranteeDemand: false,
      overCapRefund: true,
    },
  } satisfies SupportCase;

  it("refuses a refund above the cap even if the guardrail is bypassed", () => {
    const tools = createCaseTools(supportCase);
    const outcome = tools.execute("issue_refund", {
      orderId: "HBR-1",
      amountCents: HARBOR_POLICY.autoRefundCapCents + 1,
      reason: "duplicate",
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain("tool_refused_over_cap");
    expect(outcome.sideEffect).toBe("none");
  });

  it("issues a refund at the cap", () => {
    const under = {
      ...supportCase,
      order: { ...supportCase.order, amountCents: HARBOR_POLICY.autoRefundCapCents },
    } satisfies SupportCase;
    const tools = createCaseTools(under);
    const outcome = tools.execute("issue_refund", {
      orderId: "HBR-1",
      amountCents: HARBOR_POLICY.autoRefundCapCents,
      reason: "duplicate",
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.sideEffect).toBe("refund");
  });
});
