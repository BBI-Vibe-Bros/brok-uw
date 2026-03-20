import OpenAI from "openai";
import type { AiChatMessage, AiCompleteOptions, AiProvider } from "@/lib/ai/types";

function toOpenAiMessages(messages: AiChatMessage[]) {
  return messages.map((m) => ({
    role: m.role as "system" | "user" | "assistant",
    content: m.content,
  }));
}

export class OpenAiProvider implements AiProvider {
  private client: OpenAI;
  private model: string;

  constructor() {
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error("OPENAI_API_KEY is not set");
    }
    this.client = new OpenAI({ apiKey: key });
    this.model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  }

  async complete(messages: AiChatMessage[], options?: AiCompleteOptions): Promise<string> {
    const res = await this.client.chat.completions.create({
      model: this.model,
      messages: toOpenAiMessages(messages),
      temperature: options?.temperature ?? 0.2,
      ...(options?.jsonMode
        ? { response_format: { type: "json_object" as const } }
        : {}),
    });
    const text = res.choices[0]?.message?.content?.trim();
    if (!text) throw new Error("OpenAI returned empty content");
    return text;
  }
}
