import { getAiProvider } from "@/lib/ai/index";
import type { AiChatMessage, DocumentRequest, StructuredQuery } from "@/lib/ai/types";

const SCHEMA_HINT = `Return a single JSON object with these keys only:
- state: string or null (2-letter US state if mentioned)
- age: number or null
- gender: string or null ("male", "female", or null)
- conditions: string[] (medical conditions, diagnoses — normalized short phrases)
- medications: string[] (drug names)
- height_inches: number or null
- weight_lbs: number or null
- tobacco_use: boolean or null
- additional_context: string or null (other relevant underwriting facts)
- missing_fields: string[] (human-readable labels for critical missing pieces — use ONLY if you cannot infer reasonable search terms; e.g. "state", "conditions")
- document_request: null or { "kind": "medsupp_application", "carrier_mention": string or null } — use when the user wants the carrier's Medicare Supplement application/PDF/form (e.g. "send me the Aetna app", "Cigna med supp application", "download Humana application")`;

const SYSTEM = `You are a precision extraction assistant for Medicare Supplement underwriting scenarios.
Your job is to read the insurance agent's message (and optional prior turns) and output ${SCHEMA_HINT}

Rules:
- If the user is asking for an application, enrollment form, or PDF for a Med Supp / Medicare Supplement product—not underwriting eligibility—set document_request with kind "medsupp_application" and carrier_mention to the carrier name they said (or null if unclear). You may leave conditions and medications empty for that kind of request.
- Put every medical condition or diagnosis in conditions (even informal phrases like "AFib" → include "atrial fibrillation" if clearly implied, or keep "AFib" as its own term).
- Put prescription drugs in medications (brand or generic).
- If the user asks a general underwriting question with no client facts and is NOT requesting an application, set missing_fields to suggest what you need (e.g. ["client conditions or medications"]).
- If you have at least one condition OR medication OR a clear underwriting topic in additional_context, you may leave missing_fields empty (unless they only asked for an application).
- Never invent clinical facts not supported by the text. Use null/[] when unknown.
- Output valid JSON only, no markdown.`;

function parseDocumentRequest(o: Record<string, unknown>): DocumentRequest | null {
  const raw = o.document_request;
  if (raw == null || typeof raw !== "object") return null;
  const dr = raw as Record<string, unknown>;
  if (dr.kind !== "medsupp_application") return null;
  const mention = dr.carrier_mention == null ? null : String(dr.carrier_mention).trim();
  return {
    kind: "medsupp_application",
    carrier_mention: mention || null,
  };
}

function safeJsonParse(text: string): StructuredQuery {
  const data = JSON.parse(text) as unknown;
  if (!data || typeof data !== "object") throw new Error("Invalid parsed query shape");
  const o = data as Record<string, unknown>;
  const conditions = Array.isArray(o.conditions) ? o.conditions.map(String) : [];
  const medications = Array.isArray(o.medications) ? o.medications.map(String) : [];
  return {
    state: o.state == null ? null : String(o.state).trim().toUpperCase().slice(0, 2) || null,
    age: typeof o.age === "number" && Number.isFinite(o.age) ? o.age : null,
    gender: o.gender == null ? null : String(o.gender),
    conditions,
    medications,
    height_inches: typeof o.height_inches === "number" ? o.height_inches : null,
    weight_lbs: typeof o.weight_lbs === "number" ? o.weight_lbs : null,
    tobacco_use: typeof o.tobacco_use === "boolean" ? o.tobacco_use : null,
    additional_context: o.additional_context == null ? null : String(o.additional_context),
    missing_fields: Array.isArray(o.missing_fields) ? o.missing_fields.map(String) : [],
    document_request: parseDocumentRequest(o),
  };
}

function historySnippet(history: { role: string; content: string }[], maxTurns = 8): string {
  const slice = history.slice(-maxTurns);
  if (!slice.length) return "";
  return slice.map((m) => `${m.role}: ${m.content}`).join("\n");
}

export async function parseUserQuery(message: string, conversationHistory: { role: string; content: string }[]) {
  const provider = getAiProvider();
  const historyBlock = historySnippet(
    conversationHistory.filter((m) => m.role === "user" || m.role === "assistant")
  );
  const userContent =
    historyBlock.length > 0
      ? `Conversation so far:\n${historyBlock}\n\nLatest message:\n${message}`
      : message;

  const messages: AiChatMessage[] = [
    { role: "system", content: SYSTEM },
    { role: "user", content: userContent },
  ];

  const raw = await provider.complete(messages, { jsonMode: true, temperature: 0.1 });
  return safeJsonParse(raw);
}
