import { getAiProvider } from "@/lib/ai/index";
import type { AiChatMessage } from "@/lib/ai/types";
import type { CarrierResult } from "@/types/chat-results";

const SYSTEM = `You help licensed insurance agents think through Medicare Supplement underwriting.

Assume the agent is often ON THE PHONE WITH THE CLIENT while they read your message. They need a fast skim, not a memo.

Voice & length:
- Short and conversational — like a quick tap on the shoulder.
- **Total reply: aim for ~80–150 words.** Only go a bit longer if many carriers (6+) genuinely need distinct notes.
- Lead with the one-line headline (what matters most for the case).
- Then **bullets only** for carriers: one line each — verdict in plain English, plus only the single most important caveat if any.
- Skip filler, long intros, and repeating the scenario back unless one detail is critical.
- One short closing line max on carrier final authority — not a lecture.

Rules:
- Each carrier in the data may include a "source" string (doc name, page, eff date). Work it in naturally at the end of that carrier's bullet — e.g. "(Aetna Guide p.9, eff 11/2015)". Keep it short; skip if null.
- Don't invent health details the agent didn't mention.
- Don't say "database," "verified rules," "published guides," "ingested," or "stored guidelines."
- Markdown: **bold** carrier names, \`- \` bullets, optional [text](url). No JSON, no raw HTML.`;

export async function explainResults(
  userScenarioSummary: string,
  results: CarrierResult[]
): Promise<string> {
  if (!results.length) {
    return (
      "No clean hits for that scenario yet. " +
      "Add condition/meds (as on the app) and I'll try again."
    );
  }

  const provider = getAiProvider();
  const payload = results.map((r) => ({
    carrier: r.carrier_name,
    verdict: r.verdict,
    knockouts: r.knockout_conditions,
    conditional: r.conditional_notes,
    reasons: r.reasons.slice(0, 5),
    source: r.citation
      ? `${r.citation.document}${r.citation.page ? `, p.${r.citation.page}` : ""}${r.citation.effective_date ? ` (eff. ${r.citation.effective_date})` : ""}`
      : null,
    confidence: Math.round(r.confidence * 100),
  }));

  const messages: AiChatMessage[] = [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content:
        `Here's what the agent told me about the case:\n${userScenarioSummary}\n\n` +
        `Here's what I pulled together for each carrier (structured):\n${JSON.stringify(payload, null, 2)}\n\n` +
        `Reply in chat as the assistant. They're likely on a call — keep it **brief** (target ~80–150 words, bullets, bold carrier names). Lead with the headline.`,
    },
  ];

  try {
    return await provider.complete(messages, { temperature: 0.45 });
  } catch {
    const lines = results.map((r) => {
      const label = r.verdict.replace(/_/g, " ");
      const extra =
        r.knockout_conditions.length > 0
          ? ` — heads up: ${r.knockout_conditions[0]}`
          : r.conditional_notes.length > 0
            ? ` — note: ${r.conditional_notes[0]}`
            : "";
      return `- **${r.carrier_name}**: ${label}${extra}`;
    });
    return (
      `**Quick take**\n\n${lines.join("\n\n")}\n\n` +
      `Details on the cards. Confirm with the carrier before submit.`
    );
  }
}
