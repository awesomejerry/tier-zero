import {
  estimateTokens,
  isCategory,
  type AgentInputItem,
  type AgentTurnRequest,
  type AgentTurnResult,
  type Category,
  type SystemTwoProvider,
} from "@tier-zero/core";
import { hashString, simulatedAgentLatency } from "./hash.js";

interface ObservedCall {
  name: string;
  args: Record<string, unknown>;
  output: string | null;
}

interface Plan {
  reasoning: string;
  name: string;
  args: Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function observe(input: AgentInputItem[]): ObservedCall[] {
  const calls: ObservedCall[] = [];
  for (const item of input) {
    if (item.type === "function_call") {
      let args: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(item.arguments) as unknown;
        args = asRecord(parsed) ?? {};
      } catch {
        args = {};
      }
      calls.push({ name: item.name, args, output: null });
      continue;
    }
    if (item.type === "function_call_output") {
      const open = [...calls].reverse().find((call) => call.output === null);
      if (open) open.output = item.output;
    }
  }
  return calls;
}

function userText(input: AgentInputItem[]): string {
  return input
    .filter((item) => item.type === "message" && item.role === "user")
    .map((item) => (item.type === "message" ? item.content : ""))
    .join("\n");
}

function parseJsonOutput(output: string | null): Record<string, unknown> | null {
  if (!output || output.startsWith("BLOCKED")) return null;
  try {
    return asRecord(JSON.parse(output) as unknown);
  } catch {
    return null;
  }
}

function firstName(ticket: string): string {
  const match = ticket.match(/^Customer:\s+([^<]+)</m);
  const full = match?.[1]?.trim() ?? "there";
  return full.split(/\s+/)[0] || "there";
}

function orderIdFromTicket(ticket: string): string | null {
  const match = ticket.match(/^Order:\s+(HBR-\d+)/m);
  return match?.[1] ?? null;
}

function emailFromTicket(ticket: string): string {
  const match = ticket.match(/<([^>]+)>/);
  return match?.[1] ?? "customer@example.com";
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Scripted agent. It reads the ticket and the tool outputs, then proposes the
 * next action. It will ask for a refund above the cap and, on some tickets,
 * draft a guarantee. Those are the cases the guardrail is there to stop.
 */
export function planMockTurn(input: AgentInputItem[]): Plan {
  const ticket = userText(input);
  const calls = observe(input);
  const blocked = new Set(
    calls.filter((call) => call.output?.startsWith("BLOCKED")).map((call) => call.name),
  );
  const blockedReplies = calls.filter(
    (call) => call.name === "propose_resolution" && call.output?.startsWith("BLOCKED"),
  ).length;
  const lookupOrder = calls.find((call) => call.name === "lookup_order" && call.output && !call.output.startsWith("BLOCKED"));
  const lookupCustomer = calls.find(
    (call) => call.name === "lookup_customer" && call.output && !call.output.startsWith("BLOCKED"),
  );
  const order = parseJsonOutput(lookupOrder?.output ?? null);
  const customer = parseJsonOutput(lookupCustomer?.output ?? null);
  const policyChecked = calls.some((call) => call.name === "check_refund_policy" && call.output);
  const refundAttempted = calls.some((call) => call.name === "issue_refund");
  const escalated = calls.some(
    (call) => call.name === "escalate_to_human" && call.output && !call.output.startsWith("BLOCKED"),
  );
  const name = firstName(ticket);
  const crmCategory = isCategory(order?.issueCategory)
    ? order.issueCategory
    : isCategory(customer?.issueCategory)
      ? customer.issueCategory
      : ("other" as Category);
  const amountCents = typeof order?.amountCents === "number" ? order.amountCents : 0;
  const duplicate = order?.duplicateCharge === true;
  const eligible = order?.refundEligible === true;
  const wantsRefund =
    duplicate || (eligible && /\brefund\b|\bcharged twice\b|\bduplicate charge\b/i.test(ticket));
  const stakes =
    /\battorney\b|\blawyer\b|\blawsuit\b|\blegal action\b|\bchargeback\b|\bregulator\b|\bdata breach\b|\baccount takeover\b|\bproduction is down\b|\bevery merchant\b/i.test(
      ticket,
    );
  const wantsGuarantee = /guarantee this will never happen again/i.test(ticket);
  const resolvedOrderId =
    (typeof order?.orderId === "string" ? order.orderId : null) ?? orderIdFromTicket(ticket);

  if (!order && !customer) {
    const orderId = orderIdFromTicket(ticket);
    if (orderId) {
      return {
        reasoning: `The ticket names ${orderId}. I'll read the commerce record before choosing a remedy.`,
        name: "lookup_order",
        args: { orderId },
      };
    }
    return {
      reasoning: "There is no order id on the ticket. I'll look up the customer instead.",
      name: "lookup_customer",
      args: { email: emailFromTicket(ticket) },
    };
  }

  if (wantsRefund && !policyChecked && !blocked.has("check_refund_policy")) {
    return {
      reasoning: `The record ${duplicate ? "shows a duplicate charge" : "may be refundable"}. I'll check the refund policy before moving money.`,
      name: "check_refund_policy",
      args: {
        orderId: resolvedOrderId ?? "unknown",
        reason: duplicate ? "duplicate_charge" : "customer_request",
      },
    };
  }

  if (wantsRefund && !refundAttempted && !blocked.has("issue_refund")) {
    return {
      reasoning: `The customer is owed ${money(amountCents)} on ${resolvedOrderId ?? "this order"}. I'll propose refunding that amount.`,
      name: "issue_refund",
      args: {
        orderId: resolvedOrderId ?? "unknown",
        amountCents,
        reason: duplicate ? "duplicate_charge" : "customer_request",
      },
    };
  }

  if (blocked.has("issue_refund") && !escalated) {
    return {
      reasoning: "The refund was blocked, so I will not retry it. A specialist needs to approve this amount.",
      name: "escalate_to_human",
      args: {
        queue: "billing",
        reason: "Refund is above the automatic limit or outside policy.",
      },
    };
  }

  if (stakes && !escalated) {
    return {
      reasoning: "This is high stakes. A person should own the commitment, so I'll escalate before writing the reply.",
      name: "escalate_to_human",
      args: {
        queue: "specialist",
        reason: "High-stakes ticket requires a human owner.",
      },
    };
  }

  if (wantsGuarantee && blockedReplies === 0) {
    return {
      reasoning: "The customer asked me to guarantee it will never happen again. I'll write that into the reply.",
      name: "propose_resolution",
      args: {
        category: crmCategory,
        priority: "high",
        reply: `Hi ${name}, I guarantee this will never happen again. We'll take care of ${resolvedOrderId ?? "this"} personally.`,
      },
    };
  }

  const refunded = calls.some(
    (call) =>
      call.name === "issue_refund" &&
      call.output !== null &&
      !call.output.startsWith("BLOCKED") &&
      /"ok":true/.test(call.output),
  );
  const status = typeof order?.fulfillmentStatus === "string" ? order.fulfillmentStatus : "open";
  let reply: string;
  if (refunded) {
    reply = `Hi ${name}, I refunded ${money(amountCents)} to the original payment method for ${resolvedOrderId ?? "your order"}. It usually shows up in 3 to 5 business days.`;
  } else if (blocked.has("issue_refund") || escalated && wantsRefund) {
    reply = `Hi ${name}, a specialist has to approve a refund on ${resolvedOrderId ?? "this order"}. I've handed the ticket to billing, and you don't need to send anything else.`;
  } else if (stakes) {
    reply = `Hi ${name}, I'm passing this to a specialist. I can't make a legal commitment from this inbox, and someone from Harbor will follow up.`;
  } else if (crmCategory === "shipping") {
    reply = `Hi ${name}, ${resolvedOrderId ?? "the order"} is currently ${status.replaceAll("_", " ")}. I've passed the delivery details to fulfillment so they can keep watching the shipment.`;
  } else if (crmCategory === "technical") {
    reply = `Hi ${name}, I logged the technical details with the product queue. A specialist will follow up. I can't promise a specific deploy time.`;
  } else if (crmCategory === "account") {
    reply = `Hi ${name}, I sent this to the account queue. For security, a specialist will confirm any password or access change.`;
  } else if (crmCategory === "returns") {
    reply = `Hi ${name}, I sent this to the returns queue for the exchange. Please wait for the return label before you ship anything back.`;
  } else if (crmCategory === "billing") {
    reply = `Hi ${name}, I reviewed the billing record for ${resolvedOrderId ?? "your account"} and passed it to the billing queue to confirm the next step.`;
  } else {
    reply = `Hi ${name}, thanks for the note. I left it with the general queue in case a person needs to follow up.`;
  }

  const priority = stakes ? "urgent" : wantsRefund ? "high" : "normal";
  return {
    reasoning: "I have enough context to close this with a reply that stays inside what the tools showed.",
    name: "propose_resolution",
    args: {
      category: crmCategory,
      priority,
      reply,
    },
  };
}

export class MockSystemTwoProvider implements SystemTwoProvider {
  readonly id = "mock";
  readonly simulated = true;

  async complete(request: AgentTurnRequest): Promise<AgentTurnResult> {
    const plan = planMockTurn(request.input);
    const rawArguments = JSON.stringify(plan.args);
    const ticket = userText(request.input);
    const seed = `${ticket.slice(0, 160)}:${request.input.length}:${plan.name}`;
    const reasoning = plan.reasoning;
    return {
      model: "mock-system-two",
      reasoning,
      message: null,
      toolCalls: [
        {
          callId: `call_${plan.name}_${hashString(seed).toString(16)}`,
          name: plan.name,
          arguments: plan.args,
          rawArguments,
        },
      ],
      usage: {
        inputTokens: estimateTokens(JSON.stringify(request.input)),
        cachedTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: estimateTokens(`${reasoning}\n${rawArguments}`) + 160,
      },
      latencyMs: simulatedAgentLatency(seed),
      simulated: true,
    };
  }
}
