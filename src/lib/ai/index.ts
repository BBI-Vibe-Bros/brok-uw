import type { AiProvider } from "@/lib/ai/types";
import { AnthropicProvider } from "@/lib/ai/providers/anthropic";
import { OpenAiProvider } from "@/lib/ai/providers/openai";

/**
 * Factory for the configured LLM backend.
 * `AI_PROVIDER=openai` (default) or `AI_PROVIDER=anthropic`
 */
export function getAiProvider(): AiProvider {
  const raw = (process.env.AI_PROVIDER || "openai").toLowerCase();
  if (raw === "anthropic" || raw === "claude") {
    return new AnthropicProvider();
  }
  return new OpenAiProvider();
}

export type { AiChatMessage, AiCompleteOptions, AiProvider, StructuredQuery } from "@/lib/ai/types";
