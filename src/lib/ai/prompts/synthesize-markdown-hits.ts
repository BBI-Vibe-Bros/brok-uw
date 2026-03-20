import { getAiProvider } from "@/lib/ai/index";
import type { AiChatMessage } from "@/lib/ai/types";
import type { CarrierResult } from "@/types/chat-results";
import type { MarkdownHit } from "@/lib/db/queries/markdown-search";

const SYSTEM = `You are a Medicare Supplement underwriting extraction assistant.

You receive raw text snippets from a carrier's UW guide, plus the agent's scenario (conditions, meds, etc.).
Your job: determine a verdict for this carrier and return JSON.

Return a single JSON object:
{
  "verdict": "decline" | "conditional" | "likely_approve" | "unknown",
  "knockout_conditions": string[],
  "conditional_notes": string[],
  "reasons": string[],
  "follow_up_questions": string[],
  "confidence": number (0-1, how confident you are based on available text)
}

Rules:
- Only use information explicitly present in the snippets. Do NOT hallucinate conditions or rules.
- If the snippets don't mention the conditions/meds at all, return verdict "unknown" with confidence 0.2.
- If the snippets mention the condition but are ambiguous about the decision, return "unknown" or "conditional" with low confidence.
- Keep arrays short (max 3 items each). Terse strings.
- Output valid JSON only.`;

export async function synthesizeMarkdownHits(
  scenario: string,
  hits: MarkdownHit[]
): Promise<CarrierResult[]> {
  if (!hits.length) return [];

  const provider = getAiProvider();
  const results: CarrierResult[] = [];

  const tasks = hits.map(async (hit) => {
    const snippetBlock = hit.snippets
      .map((s, i) => `--- snippet ${i + 1} ---\n${s}`)
      .join("\n\n");

    const messages: AiChatMessage[] = [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content:
          `Carrier: ${hit.carrier_name}\nAgent scenario: ${scenario}\n\n` +
          `Guide snippets:\n${snippetBlock}\n\n` +
          `Return JSON verdict for this carrier.`,
      },
    ];

    try {
      const raw = await provider.complete(messages, { temperature: 0.15, jsonMode: true });
      const parsed = JSON.parse(raw) as Record<string, unknown>;

      const verdict = ["decline", "conditional", "likely_approve", "unknown"].includes(
        String(parsed.verdict)
      )
        ? (String(parsed.verdict) as CarrierResult["verdict"])
        : "unknown";

      const toArr = (v: unknown) =>
        Array.isArray(v) ? v.map(String).slice(0, 3) : [];

      return {
        carrier_id: hit.carrier_id,
        carrier_name: hit.carrier_name,
        verdict,
        reasons: toArr(parsed.reasons),
        knockout_conditions: toArr(parsed.knockout_conditions),
        conditional_notes: toArr(parsed.conditional_notes),
        follow_up_questions: toArr(parsed.follow_up_questions),
        citation: {
          document: hit.filename,
          page: null,
          section: null,
          effective_date: hit.effective_date,
        },
        confidence:
          typeof parsed.confidence === "number"
            ? Math.min(1, Math.max(0, parsed.confidence))
            : 0.3,
      } satisfies CarrierResult;
    } catch (err) {
      console.error(`synthesize markdown for ${hit.carrier_name}`, err);
      return {
        carrier_id: hit.carrier_id,
        carrier_name: hit.carrier_name,
        verdict: "unknown" as const,
        reasons: ["Guide text found but couldn't fully parse — check the guide directly."],
        knockout_conditions: [],
        conditional_notes: [],
        follow_up_questions: [],
        citation: {
          document: hit.filename,
          page: null,
          section: null,
          effective_date: hit.effective_date,
        },
        confidence: 0.15,
      } satisfies CarrierResult;
    }
  });

  const settled = await Promise.allSettled(tasks);
  for (const s of settled) {
    if (s.status === "fulfilled" && s.value) results.push(s.value);
  }

  return results;
}
