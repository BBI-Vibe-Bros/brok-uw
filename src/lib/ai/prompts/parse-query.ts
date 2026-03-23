import { getAiProvider } from "@/lib/ai/index";
import type { AiChatMessage, DocumentRequest, DownloadableDocKind, QueryIntent, StructuredQuery } from "@/lib/ai/types";

const VALID_INTENTS: QueryIntent[] = [
  "client_scenario",
  "general_question",
  "followup",
  "greeting",
  "document_request",
];

const SCHEMA_HINT = `Return a single JSON object with these keys only:
- intent: one of "client_scenario" | "general_question" | "followup" | "greeting" | "document_request"
    "client_scenario" — the agent is describing a real client (has conditions, meds, age, state, etc.)
    "general_question" — an underwriting question without a specific client, OR a capabilities question, OR asking what carriers/guides/data you have. Examples: "what can you do?", "is COPD usually a decline?", "which carriers do you cover?", "do you have guides for Aetna and INA?", "what carriers are on file?"
    "followup" — builds on something already discussed ("what about if she stopped Eliquis?", "and Humana?", "drop the tobacco", "what about in Florida?")
    "greeting" — casual/social ("hey", "thanks", "good morning", "appreciate it")
    "document_request" — ONLY when the user explicitly wants to download/receive a carrier document. Clear download intent like "send me the Aetna app", "download the Humana rate sheet", "get me the producer guide". Do NOT use this for questions about what guides or data exist.
- state: string or null (2-letter US state if mentioned)
- age: number or null
- gender: string or null ("male", "female", or null)
- conditions: string[] (medical conditions, diagnoses — normalized short phrases)
- medications: string[] (drug names)
- carrier_filter: string[] (specific carrier names the user wants to focus on, e.g. ["Aetna"] or ["INA", "Bankers Fidelity"]. Extract when the user names one or more carriers in the context of a question or scenario.)
- height_inches: number or null
- weight_lbs: number or null
- tobacco_use: boolean or null
- additional_context: string or null (other relevant underwriting facts, OR the gist of a general question)
- missing_fields: string[] (use ONLY for client_scenario when you truly cannot infer any search terms)
- document_request: null or { "kind": "medsupp_application" | "rate_sheet" | "producer_guide", "carrier_mention": string or null }
    Use "medsupp_application" for enrollment forms, apps. "rate_sheet" for rate sheets, rate cards, pricing. "producer_guide" for producer/agent/broker guides.`;

const SYSTEM = `You are a message classifier and extraction assistant for a Medicare Supplement underwriting chat.

Your job: read the insurance agent's message (and optional prior turns) and output ${SCHEMA_HINT}

Classification guidance:
- "greeting" for hellos, thanks, pleasantries, or "hey" with no real question.
- "general_question" for broad underwriting questions, capability questions, asking about available carriers/guides, or anything that isn't about a specific client. Examples: "is COPD a knockout?", "what carriers are strict on diabetes?", "what can you help me with?", "which carriers do you cover?", "do you have underwriting guides for Wellabe and INA?", "what data do you have?"
- "followup" when the conversation already has context and the new message modifies or extends it: "what if no tobacco?", "and Bankers Fidelity?", "try Ohio instead", "what about without the Eliquis?"
- "client_scenario" when there's a real client with at least one condition, medication, or specific demographic detail.
- "document_request" ONLY when they explicitly want to download/receive/get a copy of a carrier document (application, rate sheet, producer guide). "Do you have guides?" is NOT a document_request — that's a general_question. "Send me the Aetna app" IS a document_request. "Get me the Humana rate sheet" IS a document_request.

Extraction rules (for client_scenario and followup):
- Put every medical condition or diagnosis in conditions.
- Put prescription drugs in medications.
- For followup, extract ONLY the new/changed info — the server will merge with prior context.
- Never invent clinical facts not supported by the text.
- Only populate missing_fields for client_scenario when you genuinely have zero search terms.

For general_question:
- Put the gist of their question in additional_context.
- STILL extract any conditions or medications mentioned (e.g. "is COPD usually a decline?" → conditions: ["COPD"]). This lets us look up real carrier data.
- Leave missing_fields empty.

For greeting:
- Put the gist in additional_context. Leave conditions/medications/missing_fields empty.

Output valid JSON only, no markdown.`;

const VALID_DOC_KINDS: DownloadableDocKind[] = ["medsupp_application", "rate_sheet", "producer_guide"];

function parseDocumentRequest(o: Record<string, unknown>): DocumentRequest | null {
  const raw = o.document_request;
  if (raw == null || typeof raw !== "object") return null;
  const dr = raw as Record<string, unknown>;
  const kind = typeof dr.kind === "string" ? dr.kind : "";
  if (!VALID_DOC_KINDS.includes(kind as DownloadableDocKind)) return null;
  const mention = dr.carrier_mention == null ? null : String(dr.carrier_mention).trim();
  return {
    kind: kind as DownloadableDocKind,
    carrier_mention: mention || null,
  };
}

function resolveIntent(o: Record<string, unknown>): QueryIntent {
  const raw = typeof o.intent === "string" ? o.intent : "";
  if (VALID_INTENTS.includes(raw as QueryIntent)) return raw as QueryIntent;
  if (parseDocumentRequest(o)) return "document_request";
  const conds = Array.isArray(o.conditions) ? o.conditions : [];
  const meds = Array.isArray(o.medications) ? o.medications : [];
  if (conds.length > 0 || meds.length > 0) return "client_scenario";
  return "general_question";
}

function safeJsonParse(text: string): StructuredQuery {
  const data = JSON.parse(text) as unknown;
  if (!data || typeof data !== "object") throw new Error("Invalid parsed query shape");
  const o = data as Record<string, unknown>;
  const conditions = Array.isArray(o.conditions) ? o.conditions.map(String) : [];
  const medications = Array.isArray(o.medications) ? o.medications.map(String) : [];
  return {
    intent: resolveIntent(o),
    state: o.state == null ? null : String(o.state).trim().toUpperCase().slice(0, 2) || null,
    age: typeof o.age === "number" && Number.isFinite(o.age) ? o.age : null,
    gender: o.gender == null ? null : String(o.gender),
    conditions,
    medications,
    carrier_filter: Array.isArray(o.carrier_filter) ? o.carrier_filter.map(String) : [],
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
