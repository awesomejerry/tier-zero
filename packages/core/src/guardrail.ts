import { decisionsCostUsd } from "./pricing.js";
import {
  HARBOR_POLICY,
  REPLY_GUARD_QUESTIONS,
  TOOL_GUARD_QUESTIONS,
} from "./questions.js";
import { predicateProbability } from "./confidence.js";
import type {
  DecisionInputItem,
  DecisionResult,
  SystemOneProvider,
  Usage,
} from "./types.js";

export interface GuardrailVerdict {
  action: "allow" | "block";
  reasons: string[];
  checks: { name: string; probability: number }[];
  usage: Usage;
  latencyMs: number;
  costUsd: number;
  simulated: boolean;
  result: DecisionResult;
}

export interface ProposedToolCall {
  name: string;
  arguments: Record<string, unknown>;
  callId: string;
}

function checksFrom(
  result: DecisionResult,
  names: string[],
): { name: string; probability: number }[] {
  return names.map((name) => ({
    name,
    probability: predicateProbability(result, name) ?? 0,
  }));
}

function verdictFrom(
  result: DecisionResult,
  reasons: string[],
  names: string[],
): GuardrailVerdict {
  return {
    action: reasons.length === 0 ? "allow" : "block",
    reasons,
    checks: checksFrom(result, names),
    usage: result.usage,
    latencyMs: result.latencyMs,
    costUsd: decisionsCostUsd(result.usage),
    simulated: result.simulated,
    result,
  };
}

export function toolCallInput(args: {
  ticketText: string;
  call: ProposedToolCall;
  orderSummary: string;
}): DecisionInputItem[] {
  const evidence = [
    "Evaluate this proposed Harbor support tool call.",
    `TICKET\n${args.ticketText}`,
    `TOOL ${args.call.name}`,
    `ARGS ${JSON.stringify(args.call.arguments)}`,
    `POLICY autoRefundCapCents=${HARBOR_POLICY.autoRefundCapCents} refundWindowDays=${HARBOR_POLICY.refundWindowDays}`,
    `ORDER ${args.orderSummary || "none"}`,
  ].join("\n\n");

  return [
    { type: "message", role: "developer", content: evidence },
    {
      type: "function_call",
      callId: args.call.callId,
      name: args.call.name,
      arguments: JSON.stringify(args.call.arguments),
    },
  ];
}

export function replyInput(args: {
  ticketText: string;
  reply: string;
  orderSummary: string;
}): DecisionInputItem[] {
  const evidence = [
    "Evaluate this draft customer reply before it is sent.",
    `TICKET\n${args.ticketText}`,
    `POLICY autoRefundCapCents=${HARBOR_POLICY.autoRefundCapCents} refundWindowDays=${HARBOR_POLICY.refundWindowDays}`,
    `ORDER ${args.orderSummary || "none"}`,
    `REPLY\n${args.reply}`,
  ].join("\n\n");
  return [
    { type: "message", role: "developer", content: evidence },
    { type: "message", role: "assistant", content: args.reply },
  ];
}

/**
 * System One checks the proposed side effect. Lookups are not special-cased
 * here; the provider answers within_policy, and the thresholds below decide.
 */
export async function reviewToolCall(
  systemOne: SystemOneProvider,
  args: {
    ticketText: string;
    call: ProposedToolCall;
    orderSummary: string;
  },
): Promise<GuardrailVerdict> {
  const result = await systemOne.decide({
    input: toolCallInput(args),
    questions: TOOL_GUARD_QUESTIONS,
    promptCacheKey: "harbor-tool-guard",
  });
  const within = predicateProbability(result, "within_policy") ?? 0;
  const human = predicateProbability(result, "requires_human") ?? 0;
  const reasons: string[] = [];
  if (result.answers.some((answer) => answer.type === "refusal")) {
    reasons.push("guardrail_refused");
  }
  if (within < 0.5) reasons.push("outside_policy");
  if (args.call.name === "issue_refund" && human >= 0.7) {
    reasons.push("needs_human_approval");
  }
  return verdictFrom(result, reasons, ["within_policy", "requires_human"]);
}

export async function reviewReply(
  systemOne: SystemOneProvider,
  args: {
    ticketText: string;
    reply: string;
    orderSummary: string;
  },
): Promise<GuardrailVerdict> {
  const result = await systemOne.decide({
    input: replyInput(args),
    questions: REPLY_GUARD_QUESTIONS,
    promptCacheKey: "harbor-reply-guard",
  });
  const promises = predicateProbability(result, "promises_unsupported") ?? 1;
  const leaks = predicateProbability(result, "discloses_internal") ?? 1;
  const liability = predicateProbability(result, "admits_liability") ?? 1;
  const reasons: string[] = [];
  if (result.answers.some((answer) => answer.type === "refusal")) {
    reasons.push("guardrail_refused");
  }
  if (promises >= 0.6) reasons.push("promises_unsupported");
  if (leaks >= 0.5) reasons.push("discloses_internal");
  if (liability >= 0.5) reasons.push("admits_liability");
  return verdictFrom(result, reasons, [
    "promises_unsupported",
    "discloses_internal",
    "admits_liability",
  ]);
}

export function formatBlock(verdict: GuardrailVerdict): string {
  const detail = verdict.checks
    .map((check) => `${check.name}=${check.probability.toFixed(2)}`)
    .join(" ");
  return `BLOCKED ${verdict.reasons.join(",")} ${detail}`.trim();
}
