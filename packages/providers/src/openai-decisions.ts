import type {
  ChoiceValue,
  DecisionAnswer,
  DecisionInput,
  DecisionInputItem,
  DecisionQuestion,
  DecisionRequest,
  DecisionResult,
  SystemOneProvider,
  Usage,
} from "@tier-zero/core";
import { asNumber, isRecord } from "./json.js";

export interface OpenAIDecisionsConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/**
 * OpenAI Decisions API adapter.
 * POST /v1/decisions, model gpt-6-luna.
 * https://developers.openai.com/api/docs/guides/decisions
 *
 * The request carries model, input (a string or ordered messages and tool
 * items), and 1–400 questions. Predicate answers are a probability, choice
 * answers are a value plus a distribution, and score answers are a
 * probability-weighted level index.
 */
export class OpenAIDecisionsProvider implements SystemOneProvider {
  readonly id = "openai-decisions";
  readonly simulated = false;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(config: OpenAIDecisionsConfig) {
    if (!config.apiKey) throw new Error("OPENAI_API_KEY is required for the Decisions adapter.");
    this.apiKey = config.apiKey;
    this.model = config.model ?? "gpt-6-luna";
    this.baseUrl = (config.baseUrl ?? "https://api.openai.com").replace(/\/$/, "");
    this.fetchImpl = config.fetch ?? fetch;
    this.timeoutMs = config.timeoutMs ?? 30_000;
  }

  async decide(request: DecisionRequest): Promise<DecisionResult> {
    if (request.questions.length < 1 || request.questions.length > 400) {
      throw new Error("Decisions requests must contain between 1 and 400 questions.");
    }
    const body: Record<string, unknown> = {
      model: this.model,
      input: mapInput(request.input),
      questions: request.questions.map(mapQuestion),
    };
    if (request.promptCacheKey) body.prompt_cache_key = request.promptCacheKey;

    const started = Date.now();
    const response = await this.fetchImpl(`${this.baseUrl}/v1/decisions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const latencyMs = Date.now() - started;
    const raw = await response.text();
    if (!response.ok) {
      throw new Error(`Decisions API ${response.status}: ${raw.slice(0, 500)}`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      throw new Error("Decisions API returned a body that was not JSON.");
    }
    return parseDecisionResponse(parsed, latencyMs);
  }
}

export function mapInput(input: DecisionInput): unknown {
  if (typeof input === "string") return input;
  return input.map(mapInputItem);
}

function mapInputItem(item: DecisionInputItem): Record<string, unknown> {
  if (item.type === "message") {
    return { type: "message", role: item.role, content: item.content };
  }
  if (item.type === "function_call") {
    return {
      type: "function_call",
      call_id: item.callId,
      name: item.name,
      arguments: item.arguments,
    };
  }
  return {
    type: "function_call_output",
    call_id: item.callId,
    output: item.output,
  };
}

export function mapQuestion(question: DecisionQuestion): Record<string, unknown> {
  if (question.type === "predicate") {
    return { type: "predicate", name: question.name, instructions: question.instructions };
  }
  if (question.type === "choice") {
    return {
      type: "choice",
      name: question.name,
      instructions: question.instructions,
      choices: question.choices.map((choice) => {
        const mapped: Record<string, unknown> = { value: choice.value };
        if (choice.description) mapped.description = choice.description;
        return mapped;
      }),
    };
  }
  return {
    type: "score",
    name: question.name,
    instructions: question.instructions,
    levels: question.levels.map((level) => {
      const mapped: Record<string, unknown> = { label: level.label };
      if (level.description) mapped.description = level.description;
      return mapped;
    }),
  };
}

function parseUsage(value: unknown): Usage {
  const usage = isRecord(value) ? value : {};
  const details = isRecord(usage.input_tokens_details) ? usage.input_tokens_details : {};
  return {
    inputTokens: asNumber(usage.input_tokens),
    cachedTokens: asNumber(details.cached_tokens),
    cacheWriteTokens: asNumber(details.cache_write_tokens),
    outputTokens: asNumber(usage.output_tokens),
  };
}

function parseChoiceValue(value: unknown): ChoiceValue {
  if (typeof value === "string" || typeof value === "boolean") return value;
  throw new Error("Decision choice value must be a string or a boolean.");
}

export function parseDecisionResponse(payload: unknown, latencyMs: number): DecisionResult {
  if (!isRecord(payload)) throw new Error("Decision response was not an object.");
  if (!Array.isArray(payload.answers)) throw new Error("Decision response is missing answers.");
  const answers: DecisionAnswer[] = payload.answers.map((entry) => {
    if (!isRecord(entry) || typeof entry.type !== "string") {
      throw new Error("Decision answer was not an object.");
    }
    const name = typeof entry.name === "string" ? entry.name : null;
    if (entry.type === "refusal") return { type: "refusal", name };
    if (name === null) throw new Error("Decision answer is missing a name.");
    if (entry.type === "predicate") {
      return { type: "predicate", name, probability: asNumber(entry.probability) };
    }
    if (entry.type === "choice") {
      if (!Array.isArray(entry.probabilities)) {
        throw new Error(`Choice answer ${name} is missing probabilities.`);
      }
      return {
        type: "choice",
        name,
        choice: parseChoiceValue(entry.choice),
        confidence: asNumber(entry.confidence),
        probabilities: entry.probabilities.map((item) => {
          if (!isRecord(item)) throw new Error(`Choice answer ${name} has a bad probability row.`);
          return {
            value: parseChoiceValue(item.value),
            probability: asNumber(item.probability),
          };
        }),
      };
    }
    if (entry.type === "score") {
      if (!Array.isArray(entry.probabilities)) {
        throw new Error(`Score answer ${name} is missing probabilities.`);
      }
      return {
        type: "score",
        name,
        score: asNumber(entry.score),
        confidence: asNumber(entry.confidence),
        probabilities: entry.probabilities.map((item) => {
          if (!isRecord(item)) throw new Error(`Score answer ${name} has a bad probability row.`);
          return {
            value: asNumber(item.value),
            label: typeof item.label === "string" ? item.label : "",
            probability: asNumber(item.probability),
          };
        }),
      };
    }
    throw new Error(`Unknown decision answer type: ${entry.type}`);
  });

  return {
    model: typeof payload.model === "string" ? payload.model : "gpt-6-luna",
    answers,
    usage: parseUsage(payload.usage),
    latencyMs,
    simulated: false,
  };
}
