export const CATEGORIES = [
  "billing",
  "shipping",
  "technical",
  "account",
  "returns",
  "other",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const SEVERITY_LABELS = [
  "informational",
  "low",
  "medium",
  "high",
  "critical",
] as const;

export type SeverityLabel = (typeof SEVERITY_LABELS)[number];

export type Channel = "email" | "chat" | "web";
export type Plan = "free" | "pro" | "enterprise";

export interface Ticket {
  id: string;
  receivedAt: string;
  channel: Channel;
  subject: string;
  body: string;
  customer: {
    name: string;
    email: string;
    plan: Plan;
  };
  orderId: string | null;
}

export interface OrderRecord {
  orderId: string;
  product: string;
  amountCents: number;
  placedAt: string;
  daysSincePurchase: number;
  fulfillmentStatus:
    | "delivered"
    | "in_transit"
    | "delayed"
    | "lost"
    | "digital"
    | "none";
  issueCategory: Category;
  duplicateCharge: boolean;
  refundEligible: boolean;
  /** A stale commerce tag. The mock agent trusts this field, so a few cases stay wrong. */
  crmAgreesWithLabel: boolean;
}

export interface CustomerRecord {
  email: string;
  name: string;
  plan: Plan;
  accountStatus: "active" | "locked" | "past_due";
  issueCategory: Category;
}

/**
 * Authored with the synthetic ticket. Operators do not see this in the reply.
 * Metrics and the benchmark read it.
 */
export interface TicketLabel {
  category: Category;
  severityIndex: number;
  isHighStakes: boolean;
  needsAccountLookup: boolean;
  hasLegalThreat: boolean;
}

export type Cohort = "clear" | "borderline" | "confused" | "stakes";

export interface SupportCase {
  ticket: Ticket;
  order: OrderRecord | null;
  customer: CustomerRecord;
  label: TicketLabel;
  /**
   * Generator metadata for tests and the write-up. The heuristic never reads it.
   * `confusedAs` is the category the bag-of-words scorer is expected to pick.
   */
  generator: {
    cohort: Cohort;
    scenarioId: string;
    confusedAs: Category | null;
    guaranteeDemand: boolean;
    overCapRefund: boolean;
  };
}

export interface Usage {
  inputTokens: number;
  cachedTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
}

export function emptyUsage(): Usage {
  return {
    inputTokens: 0,
    cachedTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
  };
}

export function addUsage(a: Usage, b: Usage): Usage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    cachedTokens: a.cachedTokens + b.cachedTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
    outputTokens: a.outputTokens + b.outputTokens,
  };
}

export type ChoiceValue = string | boolean;

export interface ChoiceOption {
  value: ChoiceValue;
  description?: string;
}

export interface ScoreLevel {
  label: string;
  description?: string;
}

export type QuestionInstructions = string;

export type DecisionQuestion =
  | {
      type: "predicate";
      name: string;
      instructions: QuestionInstructions;
    }
  | {
      type: "choice";
      name: string;
      instructions: QuestionInstructions;
      choices: ChoiceOption[];
    }
  | {
      type: "score";
      name: string;
      instructions: QuestionInstructions;
      levels: ScoreLevel[];
    };

export type DecisionInputItem =
  | {
      type: "message";
      role: "developer" | "system" | "user" | "assistant";
      content: string;
    }
  | {
      type: "function_call";
      callId: string;
      name: string;
      arguments: string;
    }
  | {
      type: "function_call_output";
      callId: string;
      output: string;
    };

export type DecisionInput = string | DecisionInputItem[];

export interface DecisionRequest {
  input: DecisionInput;
  questions: DecisionQuestion[];
  promptCacheKey?: string;
}

export type DecisionAnswer =
  | {
      type: "predicate";
      name: string;
      probability: number;
    }
  | {
      type: "choice";
      name: string;
      choice: ChoiceValue;
      probabilities: { value: ChoiceValue; probability: number }[];
      confidence: number;
    }
  | {
      type: "score";
      name: string;
      score: number;
      probabilities: { value: number; label: string; probability: number }[];
      confidence: number;
    }
  | {
      type: "refusal";
      name: string | null;
    };

export interface DecisionResult {
  model: string;
  answers: DecisionAnswer[];
  usage: Usage;
  latencyMs: number;
  /** True when latency and tokens were produced by the simulator, not an API call. */
  simulated: boolean;
}

export interface SystemOneProvider {
  readonly id: string;
  readonly simulated: boolean;
  decide(request: DecisionRequest): Promise<DecisionResult>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export type AgentInputItem =
  | {
      type: "message";
      role: "developer" | "user" | "assistant";
      content: string;
    }
  | {
      type: "function_call";
      callId: string;
      name: string;
      arguments: string;
    }
  | {
      type: "function_call_output";
      callId: string;
      output: string;
    };

export interface AgentTurnRequest {
  input: AgentInputItem[];
  tools: ToolDefinition[];
}

export interface AgentToolCall {
  callId: string;
  name: string;
  arguments: Record<string, unknown>;
  rawArguments: string;
}

export interface AgentTurnResult {
  model: string;
  reasoning: string | null;
  message: string | null;
  toolCalls: AgentToolCall[];
  usage: Usage;
  latencyMs: number;
  simulated: boolean;
}

export interface SystemTwoProvider {
  readonly id: string;
  readonly simulated: boolean;
  complete(request: AgentTurnRequest): Promise<AgentTurnResult>;
}

export function isCategory(value: unknown): value is Category {
  return (
    typeof value === "string" &&
    (CATEGORIES as readonly string[]).includes(value)
  );
}

export function ticketText(ticket: Ticket): string {
  return [
    `Customer: ${ticket.customer.name} <${ticket.customer.email}>`,
    `Plan: ${ticket.customer.plan}`,
    `Channel: ${ticket.channel}`,
    ticket.orderId ? `Order: ${ticket.orderId}` : "Order: none",
    `Subject: ${ticket.subject}`,
    "",
    ticket.body,
  ].join("\n");
}
