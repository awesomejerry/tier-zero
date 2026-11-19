import { describe, expect, it } from "vitest";
import {
  prepareCase,
  routeTicket,
  ticketText,
  triageQuestions,
} from "@tier-zero/core";
import { cases } from "@tier-zero/dataset";
import { MockSystemOneProvider, MockSystemTwoProvider, topCategory } from "@tier-zero/providers";

const systemOne = new MockSystemOneProvider();
const systemTwo = new MockSystemTwoProvider();

function preview(supportCase: (typeof cases)[number]): string {
  const text = `${supportCase.ticket.subject}\n${supportCase.ticket.body}`;
  const top = topCategory(text);
  return `${supportCase.generator.scenarioId} ${supportCase.ticket.subject} -> ${top.category} ${top.confidence.toFixed(3)}`;
}

describe("mock heuristic on the seeded dataset", () => {
  it("contains the planned cohort sizes", () => {
    expect(cases).toHaveLength(300);
    const counts = new Map<string, number>();
    for (const supportCase of cases) {
      counts.set(supportCase.generator.cohort, (counts.get(supportCase.generator.cohort) ?? 0) + 1);
    }
    expect(counts.get("clear")).toBe(190);
    expect(counts.get("confused")).toBe(46);
    expect(counts.get("borderline")).toBe(34);
    expect(counts.get("stakes")).toBe(30);
  });

  it("keeps clear, confused, borderline, and stakes in the bands the slider needs", async () => {
    const misses: string[] = [];
    for (const supportCase of cases) {
      const decision = await systemOne.decide({
        input: ticketText(supportCase.ticket),
        questions: triageQuestions(),
      });
      const route = routeTicket(decision, { confidenceThreshold: 0.5 });
      const { cohort, confusedAs } = supportCase.generator;
      const category = route.readout.category;
      const confidence = route.readout.operationalConfidence;
      const stakes = route.readout.isHighStakes ?? 1;
      if (cohort === "clear") {
        if (category !== supportCase.label.category || confidence < 0.8 || stakes > 0.1) {
          misses.push(`clear ${preview(supportCase)} conf=${confidence.toFixed(3)}`);
        }
      } else if (cohort === "confused") {
        if (category !== confusedAs || category === supportCase.label.category || confidence > 0.88) {
          misses.push(`confused ${preview(supportCase)} conf=${confidence.toFixed(3)}`);
        }
      } else if (cohort === "borderline") {
        if (category !== supportCase.label.category || confidence < 0.55 || confidence > 0.86) {
          misses.push(`border ${preview(supportCase)} conf=${confidence.toFixed(3)}`);
        }
      } else if (stakes < 0.9 || category !== supportCase.label.category) {
        misses.push(`stakes ${preview(supportCase)} p=${stakes.toFixed(3)}`);
      }
      if (!supportCase.label.isHighStakes && stakes > 0.1) {
        misses.push(`false stakes ${preview(supportCase)}`);
      }
    }
    expect(misses, misses.slice(0, 12).join("\n")).toEqual([]);
  });

  it("never fast-paths a high-stakes ticket", async () => {
    for (const supportCase of cases.filter((item) => item.label.isHighStakes)) {
      const decision = await systemOne.decide({
        input: ticketText(supportCase.ticket),
        questions: triageQuestions(),
      });
      expect(routeTicket(decision, { confidenceThreshold: 0.5 }).path).toBe("slow");
      expect(routeTicket(decision, { confidenceThreshold: 0.99 }).path).toBe("slow");
    }
  });
});

describe("mock agent and guardrail", () => {
  it("blocks an over-cap refund and still resolves on the billing queue", async () => {
    const supportCase = cases.find((item) => item.generator.overCapRefund);
    if (!supportCase) throw new Error("missing over-cap case");
    const prepared = await prepareCase(supportCase, systemOne, systemTwo);
    expect(prepared.slow.blockedCount).toBeGreaterThan(0);
    expect(prepared.slow.refundedCents).toBeNull();
    expect(prepared.slow.escalated).toBe(true);
    expect(prepared.slow.category).toBe("billing");
    expect(prepared.slow.reply.toLowerCase()).not.toContain("guarantee");
    expect(prepared.slow.trace.some((event) => event.verdict === "block" && event.name === "issue_refund")).toBe(
      true,
    );
    expect(prepared.slow.simulated).toBe(true);
  });

  it("blocks a guaranteed promise and accepts the revised reply", async () => {
    const supportCase = cases.find((item) => item.generator.guaranteeDemand);
    if (!supportCase) throw new Error("missing guarantee case");
    const prepared = await prepareCase(supportCase, systemOne, systemTwo);
    const replies = prepared.slow.trace.filter((event) => event.type === "reply");
    expect(replies[0]?.verdict).toBe("block");
    expect(replies[0]?.text.toLowerCase()).toContain("guarantee");
    expect(replies.at(-1)?.verdict).toBe("allow");
    expect(prepared.slow.reply.toLowerCase()).not.toContain("guarantee");
  });

  it("issues an in-policy duplicate refund", async () => {
    const supportCase = cases.find(
      (item) => item.generator.scenarioId === "billing-duplicate" && item.order?.refundEligible,
    );
    if (!supportCase) throw new Error("missing in-policy refund");
    const prepared = await prepareCase(supportCase, systemOne, systemTwo);
    expect(prepared.slow.blockedCount).toBe(0);
    expect(prepared.slow.refundedCents).toBe(supportCase.order?.amountCents);
    expect(prepared.slow.category).toBe("billing");
  });
});
