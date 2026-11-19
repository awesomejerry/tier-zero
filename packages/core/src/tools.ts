import { HARBOR_POLICY } from "./questions.js";
import type { SupportCase, ToolDefinition } from "./types.js";

export interface ToolOutcome {
  ok: boolean;
  output: string;
  sideEffect: "none" | "refund" | "escalation" | "resolution";
}

export interface CaseTools {
  definitions: ToolDefinition[];
  execute(name: string, args: Record<string, unknown>): ToolOutcome;
  /** Side effects that actually ran. Guardrail blocks never reach this. */
  effects: ToolOutcome[];
}

const OBJECT = "object";

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "lookup_order",
    description: "Read the commerce record for a Harbor order id.",
    parameters: {
      type: OBJECT,
      additionalProperties: false,
      properties: {
        orderId: { type: "string", description: "Order id such as HBR-18421." },
      },
      required: ["orderId"],
    },
  },
  {
    name: "lookup_customer",
    description: "Read the customer profile by email when no order id is known.",
    parameters: {
      type: OBJECT,
      additionalProperties: false,
      properties: {
        email: { type: "string" },
      },
      required: ["email"],
    },
  },
  {
    name: "check_refund_policy",
    description:
      "Check whether an order can be auto-refunded. Does not move money.",
    parameters: {
      type: OBJECT,
      additionalProperties: false,
      properties: {
        orderId: { type: "string" },
        reason: { type: "string" },
      },
      required: ["orderId", "reason"],
    },
  },
  {
    name: "issue_refund",
    description:
      "Refund an order to the original payment method. Refused above the auto cap even if a guardrail is bypassed.",
    parameters: {
      type: OBJECT,
      additionalProperties: false,
      properties: {
        orderId: { type: "string" },
        amountCents: { type: "integer" },
        reason: { type: "string" },
      },
      required: ["orderId", "amountCents", "reason"],
    },
  },
  {
    name: "escalate_to_human",
    description: "Hand the ticket to a human queue with a reason.",
    parameters: {
      type: OBJECT,
      additionalProperties: false,
      properties: {
        queue: { type: "string" },
        reason: { type: "string" },
      },
      required: ["queue", "reason"],
    },
  },
  {
    name: "propose_resolution",
    description:
      "Finish the ticket with a queue category, a priority, and the customer-facing reply.",
    parameters: {
      type: OBJECT,
      additionalProperties: false,
      properties: {
        category: { type: "string" },
        priority: { type: "string" },
        reply: { type: "string" },
      },
      required: ["category", "priority", "reply"],
    },
  },
];

function json(value: unknown): string {
  return JSON.stringify(value);
}

export function createCaseTools(supportCase: SupportCase): CaseTools {
  const effects: ToolOutcome[] = [];

  function execute(name: string, args: Record<string, unknown>): ToolOutcome {
    const order = supportCase.order;
    let outcome: ToolOutcome;

    switch (name) {
      case "lookup_order": {
        if (!order || args.orderId !== order.orderId) {
          outcome = {
            ok: false,
            sideEffect: "none",
            output: json({ found: false, orderId: args.orderId ?? null }),
          };
          break;
        }
        outcome = {
          ok: true,
          sideEffect: "none",
          output: json({
            found: true,
            orderId: order.orderId,
            product: order.product,
            amountCents: order.amountCents,
            daysSincePurchase: order.daysSincePurchase,
            fulfillmentStatus: order.fulfillmentStatus,
            issueCategory: order.issueCategory,
            duplicateCharge: order.duplicateCharge,
            refundEligible: order.refundEligible,
            plan: supportCase.customer.plan,
          }),
        };
        break;
      }
      case "lookup_customer": {
        const customer = supportCase.customer;
        outcome = {
          ok: true,
          sideEffect: "none",
          output: json({
            found: true,
            email: customer.email,
            name: customer.name,
            plan: customer.plan,
            accountStatus: customer.accountStatus,
            issueCategory: customer.issueCategory,
          }),
        };
        break;
      }
      case "check_refund_policy": {
        if (!order) {
          outcome = {
            ok: true,
            sideEffect: "none",
            output: json({
              eligible: false,
              autoAllowed: false,
              reason: "no_order",
              autoRefundCapCents: HARBOR_POLICY.autoRefundCapCents,
            }),
          };
          break;
        }
        const inWindow = order.daysSincePurchase <= HARBOR_POLICY.refundWindowDays;
        const autoAllowed =
          order.refundEligible &&
          inWindow &&
          order.amountCents <= HARBOR_POLICY.autoRefundCapCents;
        outcome = {
          ok: true,
          sideEffect: "none",
          output: json({
            eligible: order.refundEligible && inWindow,
            autoAllowed,
            amountCents: order.amountCents,
            autoRefundCapCents: HARBOR_POLICY.autoRefundCapCents,
            refundWindowDays: HARBOR_POLICY.refundWindowDays,
            daysSincePurchase: order.daysSincePurchase,
          }),
        };
        break;
      }
      case "issue_refund": {
        const amount = typeof args.amountCents === "number" ? args.amountCents : Number.NaN;
        if (!order || args.orderId !== order.orderId) {
          outcome = {
            ok: false,
            sideEffect: "none",
            output: json({ ok: false, error: "order_not_found" }),
          };
          break;
        }
        if (!order.refundEligible || order.daysSincePurchase > HARBOR_POLICY.refundWindowDays) {
          outcome = {
            ok: false,
            sideEffect: "none",
            output: json({ ok: false, error: "not_eligible" }),
          };
          break;
        }
        if (amount > HARBOR_POLICY.autoRefundCapCents) {
          outcome = {
            ok: false,
            sideEffect: "none",
            output: json({ ok: false, error: "tool_refused_over_cap" }),
          };
          break;
        }
        outcome = {
          ok: true,
          sideEffect: "refund",
          output: json({
            ok: true,
            orderId: order.orderId,
            amountCents: amount,
            method: "original_payment",
          }),
        };
        break;
      }
      case "escalate_to_human": {
        outcome = {
          ok: true,
          sideEffect: "escalation",
          output: json({
            ok: true,
            queue: args.queue ?? "specialist",
            reason: args.reason ?? "",
          }),
        };
        break;
      }
      case "propose_resolution": {
        outcome = {
          ok: true,
          sideEffect: "resolution",
          output: json({ ok: true }),
        };
        break;
      }
      default: {
        outcome = {
          ok: false,
          sideEffect: "none",
          output: json({ ok: false, error: "unknown_tool" }),
        };
      }
    }

    effects.push(outcome);
    return outcome;
  }

  return { definitions: TOOL_DEFINITIONS, execute, effects };
}
