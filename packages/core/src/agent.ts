import { agentCostUsd, decisionsCostUsd } from "./pricing.js";
import { formatBlock, reviewReply, reviewToolCall } from "./guardrail.js";
import { AGENT_INSTRUCTIONS } from "./questions.js";
import { createCaseTools } from "./tools.js";
import {
  addUsage,
  emptyUsage,
  isCategory,
  ticketText,
  type AgentInputItem,
  type Category,
  type SupportCase,
  type SystemOneProvider,
  type SystemTwoProvider,
  type Usage,
} from "./types.js";

export interface TraceEvent {
  type: "reasoning" | "tool_call" | "reply";
  text: string;
  name?: string;
  arguments?: Record<string, unknown>;
  callId?: string;
  verdict?: "allow" | "block";
  reasons?: string[];
  checks?: { name: string; probability: number }[];
  output?: string;
  latencyMs: number;
  simulated: boolean;
}

export interface SlowPathResult {
  category: Category;
  reply: string;
  priority: string;
  queue: string;
  escalated: boolean;
  refundedCents: number | null;
  trace: TraceEvent[];
  decisionsUsage: Usage;
  agentUsage: Usage;
  agentLatencyMs: number;
  guardrailLatencyMs: number;
  agentCostUsd: number;
  guardrailCostUsd: number;
  blockedCount: number;
  simulated: boolean;
}

const QUEUE: Record<Category, string> = {
  billing: "billing",
  shipping: "fulfillment",
  technical: "technical",
  account: "account",
  returns: "returns",
  other: "general",
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function categoryFromResolution(args: Record<string, unknown>, fallback: Category): Category {
  return isCategory(args.category) ? args.category : fallback;
}

/**
 * System Two proposes. System One approves every tool call and every draft
 * before it runs. A blocked call is fed back as text and is not executed.
 */
export async function runSlowPath(args: {
  supportCase: SupportCase;
  fallbackCategory: Category;
  systemOne: SystemOneProvider;
  systemTwo: SystemTwoProvider;
  maxTurns?: number;
}): Promise<SlowPathResult> {
  const tools = createCaseTools(args.supportCase);
  const text = ticketText(args.supportCase.ticket);
  const input: AgentInputItem[] = [
    { type: "message", role: "developer", content: AGENT_INSTRUCTIONS },
    { type: "message", role: "user", content: text },
  ];

  const trace: TraceEvent[] = [];
  let decisionsUsage = emptyUsage();
  let agentUsage = emptyUsage();
  let agentLatencyMs = 0;
  let guardrailLatencyMs = 0;
  let blockedCount = 0;
  let simulated = args.systemOne.simulated || args.systemTwo.simulated;
  let orderSummary = "";
  let escalated = false;
  let refundedCents: number | null = null;
  let finalReply = "";
  let finalCategory = args.fallbackCategory;
  let finalPriority = "normal";

  const maxTurns = args.maxTurns ?? 6;

  for (let turn = 0; turn < maxTurns; turn += 1) {
    const result = await args.systemTwo.complete({
      input,
      tools: tools.definitions,
    });
    simulated = simulated || result.simulated;
    agentUsage = addUsage(agentUsage, result.usage);
    agentLatencyMs += result.latencyMs;
    if (result.reasoning) {
      trace.push({
        type: "reasoning",
        text: result.reasoning,
        latencyMs: result.latencyMs,
        simulated: result.simulated,
      });
    }

    if (result.toolCalls.length === 0) {
      const draft = result.message?.trim() || "";
      if (!draft) break;
      const verdict = await reviewReply(args.systemOne, {
        ticketText: text,
        reply: draft,
        orderSummary,
      });
      simulated = simulated || verdict.simulated;
      decisionsUsage = addUsage(decisionsUsage, verdict.usage);
      guardrailLatencyMs += verdict.latencyMs;
      trace.push({
        type: "reply",
        text: draft,
        verdict: verdict.action,
        reasons: verdict.reasons,
        checks: verdict.checks,
        latencyMs: verdict.latencyMs,
        simulated: verdict.simulated,
      });
      if (verdict.action === "block") {
        blockedCount += 1;
        input.push({
          type: "message",
          role: "assistant",
          content: draft,
        });
        input.push({
          type: "message",
          role: "developer",
          content: formatBlock(verdict) + " Rewrite the reply without the blocked content.",
        });
        continue;
      }
      finalReply = draft;
      break;
    }

    let resolved = false;
    for (const call of result.toolCalls) {
      input.push({
        type: "function_call",
        callId: call.callId,
        name: call.name,
        arguments: call.rawArguments,
      });

      if (call.name === "propose_resolution") {
        const reply = typeof call.arguments.reply === "string" ? call.arguments.reply : "";
        const verdict = await reviewReply(args.systemOne, {
          ticketText: text,
          reply,
          orderSummary,
        });
        simulated = simulated || verdict.simulated;
        decisionsUsage = addUsage(decisionsUsage, verdict.usage);
        guardrailLatencyMs += verdict.latencyMs;
        trace.push({
          type: "reply",
          text: reply,
          name: call.name,
          arguments: call.arguments,
          callId: call.callId,
          verdict: verdict.action,
          reasons: verdict.reasons,
          checks: verdict.checks,
          latencyMs: verdict.latencyMs,
          simulated: verdict.simulated,
        });
        if (verdict.action === "block") {
          blockedCount += 1;
          input.push({
            type: "function_call_output",
            callId: call.callId,
            output: formatBlock(verdict),
          });
          continue;
        }
        tools.execute(call.name, call.arguments);
        finalReply = reply;
        finalCategory = categoryFromResolution(call.arguments, args.fallbackCategory);
        finalPriority = typeof call.arguments.priority === "string" ? call.arguments.priority : "normal";
        input.push({
          type: "function_call_output",
          callId: call.callId,
          output: JSON.stringify({ ok: true }),
        });
        resolved = true;
        break;
      }

      const verdict = await reviewToolCall(args.systemOne, {
        ticketText: text,
        call,
        orderSummary,
      });
      simulated = simulated || verdict.simulated;
      decisionsUsage = addUsage(decisionsUsage, verdict.usage);
      guardrailLatencyMs += verdict.latencyMs;

      if (verdict.action === "block") {
        blockedCount += 1;
        const blocked = formatBlock(verdict);
        trace.push({
          type: "tool_call",
          text: `${call.name} blocked`,
          name: call.name,
          arguments: call.arguments,
          callId: call.callId,
          verdict: "block",
          reasons: verdict.reasons,
          checks: verdict.checks,
          output: blocked,
          latencyMs: verdict.latencyMs,
          simulated: verdict.simulated,
        });
        input.push({
          type: "function_call_output",
          callId: call.callId,
          output: blocked,
        });
        continue;
      }

      const executed = tools.execute(call.name, call.arguments);
      if (call.name === "lookup_order" || call.name === "lookup_customer") {
        orderSummary = executed.output;
      }
      if (executed.sideEffect === "escalation") escalated = true;
      if (executed.sideEffect === "refund") {
        const parsed = asRecord(JSON.parse(executed.output) as unknown);
        refundedCents = typeof parsed.amountCents === "number" ? parsed.amountCents : refundedCents;
      }
      trace.push({
        type: "tool_call",
        text: `${call.name} allowed`,
        name: call.name,
        arguments: call.arguments,
        callId: call.callId,
        verdict: "allow",
        reasons: verdict.reasons,
        checks: verdict.checks,
        output: executed.output,
        latencyMs: verdict.latencyMs,
        simulated: verdict.simulated,
      });
      input.push({
        type: "function_call_output",
        callId: call.callId,
        output: executed.output,
      });
    }

    if (resolved) break;
  }

  if (!finalReply) {
    const name = args.supportCase.ticket.customer.name.split(" ")[0] || "there";
    finalReply = `Hi ${name}, a specialist needs to take this one. I've handed the ticket to the ${QUEUE[finalCategory]} queue and you don't need to do anything else.`;
    escalated = true;
    trace.push({
      type: "reply",
      text: finalReply,
      verdict: "allow",
      reasons: ["turn_limit"],
      latencyMs: 0,
      simulated,
    });
  }

  return {
    category: finalCategory,
    reply: finalReply,
    priority: finalPriority,
    queue: QUEUE[finalCategory],
    escalated,
    refundedCents,
    trace,
    decisionsUsage,
    agentUsage,
    agentLatencyMs,
    guardrailLatencyMs,
    agentCostUsd: agentCostUsd(agentUsage),
    guardrailCostUsd: decisionsCostUsd(decisionsUsage),
    blockedCount,
    simulated,
  };
}
