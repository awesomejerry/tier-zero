import type { SystemOneProvider, SystemTwoProvider } from "@tier-zero/core";
import { JevSystemOneProvider } from "./jev.js";
import { MockSystemOneProvider } from "./mock-system-one.js";
import { MockSystemTwoProvider } from "./mock-system-two.js";
import { OpenAIDecisionsProvider } from "./openai-decisions.js";
import { OpenAIResponsesProvider } from "./openai-responses.js";

export type ProviderKind = "mock" | "openai" | "jev";

export function createSystemOne(
  kind: ProviderKind,
  env: Record<string, string | undefined> = process.env,
): SystemOneProvider {
  if (kind === "mock") return new MockSystemOneProvider();
  if (kind === "jev") return new JevSystemOneProvider();
  const apiKey = env.OPENAI_API_KEY ?? "";
  return new OpenAIDecisionsProvider({
    apiKey,
    model: env.OPENAI_DECISIONS_MODEL || "gpt-6-luna",
    baseUrl: env.OPENAI_BASE_URL || "https://api.openai.com",
  });
}

export function createSystemTwo(
  kind: ProviderKind,
  env: Record<string, string | undefined> = process.env,
): SystemTwoProvider {
  if (kind === "openai") {
    return new OpenAIResponsesProvider({
      apiKey: env.OPENAI_API_KEY ?? "",
      model: env.OPENAI_AGENT_MODEL || "gpt-6.2-sol",
      baseUrl: env.OPENAI_BASE_URL || "https://api.openai.com",
    });
  }
  return new MockSystemTwoProvider();
}
