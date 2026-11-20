import type {
  AgentInputItem,
  AgentToolCall,
  AgentTurnRequest,
  AgentTurnResult,
  SystemTwoProvider,
  ToolDefinition,
  Usage,
} from "@tier-zero/core";
import { asNumber, isRecord } from "./json.js";

export interface OpenAIResponsesConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/**
 * System Two adapter over the OpenAI Responses API.
 * Tool calls come back as function_call output items. The agent loop in core
 * executes them only after the System One guardrail allows the call.
 */
export class OpenAIResponsesProvider implements SystemTwoProvider {
  readonly id = "openai-responses";
  readonly simulated = false;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(config: OpenAIResponsesConfig) {
    if (!config.apiKey) throw new Error("OPENAI_API_KEY is required for the Responses adapter.");
    this.apiKey = config.apiKey;
    this.model = config.model ?? "gpt-6.2-sol";
    this.baseUrl = (config.baseUrl ?? "https://api.openai.com").replace(/\/$/, "");
    this.fetchImpl = config.fetch ?? fetch;
    this.timeoutMs = config.timeoutMs ?? 120_000;
  }

  async complete(request: AgentTurnRequest): Promise<AgentTurnResult> {
    const body = {
      model: this.model,
      input: request.input.map(mapAgentItem),
      tools: request.tools.map(mapTool),
    };
    const started = Date.now();
    const response = await this.fetchImpl(`${this.baseUrl}/v1/responses`, {
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
      throw new Error(`Responses API ${response.status}: ${raw.slice(0, 500)}`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      throw new Error("Responses API returned a body that was not JSON.");
    }
    return parseResponsesBody(parsed, latencyMs, this.model);
  }
}

function mapAgentItem(item: AgentInputItem): Record<string, unknown> {
  if (item.type === "message") return { role: item.role, content: item.content };
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

function mapTool(tool: ToolDefinition): Record<string, unknown> {
  return {
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    strict: true,
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

export function parseResponsesBody(
  payload: unknown,
  latencyMs: number,
  fallbackModel: string,
): AgentTurnResult {
  if (!isRecord(payload)) throw new Error("Responses body was not an object.");
  if (!Array.isArray(payload.output)) throw new Error("Responses body is missing output.");

  const reasoningParts: string[] = [];
  const messageParts: string[] = [];
  const toolCalls: AgentToolCall[] = [];

  for (const item of payload.output) {
    if (!isRecord(item) || typeof item.type !== "string") continue;
    if (item.type === "reasoning") {
      if (Array.isArray(item.summary)) {
        for (const part of item.summary) {
          if (isRecord(part) && typeof part.text === "string") reasoningParts.push(part.text);
        }
      }
      continue;
    }
    if (item.type === "function_call") {
      const raw = typeof item.arguments === "string" ? item.arguments : "{}";
      let args: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (isRecord(parsed)) args = parsed;
      } catch {
        args = { _raw: raw };
      }
      toolCalls.push({
        callId: typeof item.call_id === "string" ? item.call_id : `call_${toolCalls.length}`,
        name: typeof item.name === "string" ? item.name : "unknown",
        arguments: args,
        rawArguments: raw,
      });
      continue;
    }
    if (item.type === "message" && Array.isArray(item.content)) {
      for (const part of item.content) {
        if (isRecord(part) && part.type === "output_text" && typeof part.text === "string") {
          messageParts.push(part.text);
        }
      }
    }
  }

  return {
    model: typeof payload.model === "string" ? payload.model : fallbackModel,
    reasoning: reasoningParts.length > 0 ? reasoningParts.join("\n") : null,
    message: messageParts.length > 0 ? messageParts.join("\n") : null,
    toolCalls,
    usage: parseUsage(payload.usage),
    latencyMs,
    simulated: false,
  };
}
