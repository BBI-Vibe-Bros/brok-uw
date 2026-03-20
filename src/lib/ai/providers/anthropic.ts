import Anthropic from "@anthropic-ai/sdk";
import type { AiChatMessage, AiCompleteOptions, AiProvider } from "@/lib/ai/types";

export class AnthropicProvider implements AiProvider {
  private client: Anthropic;
  private model: string;

  constructor() {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }
    this.client = new Anthropic({ apiKey: key });
    this.model = process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022";
  }

  async complete(messages: AiChatMessage[], options?: AiCompleteOptions): Promise<string> {
    const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const rest = messages.filter((m) => m.role !== "system");

    const anthropicMessages = rest.map((m) => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: m.content,
    }));

    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: system || undefined,
      messages: anthropicMessages,
      temperature: options?.temperature ?? 0.2,
    });

    const block = res.content.find((b) => b.type === "text");
    const text = block && block.type === "text" ? block.text.trim() : "";
    if (!text) throw new Error("Anthropic returned empty content");

    if (options?.jsonMode) {
      const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      return cleaned;
    }
    return text;
  }
}
