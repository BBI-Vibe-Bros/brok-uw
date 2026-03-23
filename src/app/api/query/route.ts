import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminRouteClient, createClient } from "@/lib/supabase/server";
import { parseUserQuery } from "@/lib/ai/prompts/parse-query";
import { explainResults } from "@/lib/ai/prompts/explain-results";
import { generateConversationalResponse } from "@/lib/ai/prompts/conversational-response";
import { gatherChatContext } from "@/lib/db/queries/context-for-chat";
import { searchDrugRules } from "@/lib/db/queries/drug-search";
import { searchRules } from "@/lib/db/queries/rules-search";
import { getLatestMedsuppApplicationForCarrier, getLatestDownloadableDoc, getAllDownloadableDocsForCarrier } from "@/lib/db/queries/medsupp-applications";
import { DOCUMENT_TYPE_LABELS, DOC_TYPE_META, type AdminDocumentType } from "@/lib/documents/document-types";
import { resolveCarrierMention } from "@/lib/carriers/resolve-carrier-mention";
import { createSignedDownloadUrl } from "@/lib/storage/signed-download-url";
import { searchMarkdownFallback } from "@/lib/db/queries/markdown-search";
import { synthesizeMarkdownHits } from "@/lib/ai/prompts/synthesize-markdown-hits";
import { scoreCarrierResults } from "@/lib/query/score-results";
import { setPhiExpiry } from "@/lib/privacy/phi-retention";
import { logAudit } from "@/lib/audit/log";
import type { StructuredQuery } from "@/lib/ai/types";
import type { CarrierResult } from "@/types/chat-results";

function summarizeScenario(structured: StructuredQuery, rawMessage: string): string {
  const parts: string[] = [];
  if (structured.carrier_filter.length) parts.push(`Carriers: ${structured.carrier_filter.join(", ")}`);
  if (structured.state) parts.push(`State: ${structured.state}`);
  if (structured.age != null) parts.push(`Age: ${structured.age}`);
  if (structured.gender) parts.push(`Gender: ${structured.gender}`);
  if (structured.conditions.length) parts.push(`Conditions: ${structured.conditions.join(", ")}`);
  if (structured.medications.length) parts.push(`Medications: ${structured.medications.join(", ")}`);
  if (structured.tobacco_use != null) parts.push(`Tobacco: ${structured.tobacco_use ? "yes" : "no"}`);
  if (structured.additional_context) parts.push(`Notes: ${structured.additional_context}`);
  if (!parts.length) return rawMessage.slice(0, 500);
  return parts.join(". ");
}

/**
 * Resolve carrier_filter names to IDs via fuzzy match against the carriers table.
 * Returns a Set of matching carrier IDs (empty = no filter).
 */
async function resolveCarrierFilter(
  svc: SupabaseClient,
  filterNames: string[]
): Promise<Set<string>> {
  if (!filterNames.length) return new Set();

  const { data: carriers } = await svc.from("carriers").select("id, name").order("name");
  if (!carriers?.length) return new Set();

  const ids = new Set<string>();
  for (const wanted of filterNames) {
    const w = wanted.toLowerCase().trim();
    for (const c of carriers) {
      if (c.name.toLowerCase().includes(w) || w.includes(c.name.toLowerCase())) {
        ids.add(c.id);
      }
    }
  }
  return ids;
}

function filterResultsByCarrier(results: CarrierResult[], allowedIds: Set<string>): CarrierResult[] {
  if (!allowedIds.size) return results;
  return results.filter((r) => allowedIds.has(r.carrier_id));
}

/**
 * Pull the most recent structured_query from conversation history.
 * The API stores it on assistant messages; the client sends back content strings,
 * so we look for the last assistant message that was a JSON-parseable structured query
 * stored alongside the results.  Alternatively, we check if the client forwarded it.
 */
function extractLastStructuredQuery(
  history: { role: string; content: string }[]
): StructuredQuery | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    if (h.role !== "assistant") continue;
    // The client doesn't forward structured_query in conversation_history content.
    // But the server persists it; look for a structured query embedded in the messages table.
    // For now, we can't recover it from plain text, so return null.
    // The follow-up path still works because the parser extracts what it can from conversation context.
  }
  return null;
}

/**
 * Merge a follow-up parse result with the prior structured query.
 * New non-null/non-empty fields override; arrays are replaced if non-empty.
 */
function mergeFollowup(prior: StructuredQuery, followup: StructuredQuery): StructuredQuery {
  return {
    intent: "client_scenario",
    state: followup.state ?? prior.state,
    age: followup.age ?? prior.age,
    gender: followup.gender ?? prior.gender,
    conditions: followup.conditions.length > 0 ? followup.conditions : prior.conditions,
    medications: followup.medications.length > 0 ? followup.medications : prior.medications,
    carrier_filter: followup.carrier_filter.length > 0 ? followup.carrier_filter : prior.carrier_filter,
    height_inches: followup.height_inches ?? prior.height_inches,
    weight_lbs: followup.weight_lbs ?? prior.weight_lbs,
    tobacco_use: followup.tobacco_use ?? prior.tobacco_use,
    additional_context: followup.additional_context ?? prior.additional_context,
    missing_fields: [],
    document_request: followup.document_request ?? prior.document_request,
  };
}

/** If the model omits `document_request`, still catch obvious app/download phrasing. */
function heuristicDocumentRequest(message: string): { kind: "medsupp_application" | "rate_sheet" | "producer_guide" } | null {
  const m = message.toLowerCase();
  const intent = /(send|give|get|download|link|need|where is|file|copy of|pdf|attach)/i.test(message);
  if (!intent) return null;

  if ((m.includes("rate") && m.includes("sheet")) || m.includes("rate card") || m.includes("pricing")) {
    return { kind: "rate_sheet" };
  }
  if (m.includes("producer guide") || m.includes("agent guide") || m.includes("broker guide")) {
    return { kind: "producer_guide" };
  }

  const wantsApp = m.includes("application") || m.includes("enrollment form") || /\bapp\b/i.test(m);
  const medsuppCue =
    m.includes("med supp") || m.includes("medsupp") || m.includes("medicare supplement") ||
    m.includes("medicare supp") || (m.includes("medicare") && m.includes("supp")) ||
    (m.includes("application") && m.includes("pdf"));
  if (wantsApp && medsuppCue) return { kind: "medsupp_application" };

  return null;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_tier, is_brock_agent")
    .eq("id", user.id)
    .single();

  if (profile && !profile.is_brock_agent && profile.subscription_tier === "lead") {
    return NextResponse.json(
      { error: "Your account doesn't have chat access yet. Contact support to get set up." },
      { status: 403 }
    );
  }

  const body = await request.json();
  const message = String(body?.message ?? "").trim();
  const conversationIdInput = body?.conversation_id ? String(body.conversation_id) : null;
  const conversationHistory = Array.isArray(body?.conversation_history)
    ? (body.conversation_history as { role: string; content: string }[])
    : [];

  if (!message) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  const svc = await createAdminRouteClient();
  let conversationId = conversationIdInput;

  try {
    let structured: StructuredQuery;
    try {
      structured = await parseUserQuery(message, conversationHistory);
      if (
        structured.intent !== "document_request" &&
        !structured.document_request
      ) {
        const heuristic = heuristicDocumentRequest(message);
        if (heuristic) {
          structured = {
            ...structured,
            intent: "document_request",
            document_request: { kind: heuristic.kind, carrier_mention: null },
          };
        }
      }
    } catch (err) {
      const hasKey =
        Boolean(process.env.OPENAI_API_KEY?.trim()) || Boolean(process.env.ANTHROPIC_API_KEY?.trim());
      if (!hasKey) {
        return NextResponse.json(
          { error: "AI key not configured — flag whoever set this up." },
          { status: 503 }
        );
      }
      console.error("parseUserQuery", err);
      const fallback = await generateConversationalResponse(message, conversationHistory);
      const { convId } = await persistExchange(svc, user.id, conversationId, message, fallback, null, []);
      return NextResponse.json({
        message: fallback,
        results: [] as CarrierResult[],
        conversation_id: convId,
        structured_query: null,
      });
    }

    // --- Greeting: quick friendly reply ---
    if (structured.intent === "greeting") {
      const reply = await generateConversationalResponse(message, conversationHistory);
      const { convId } = await persistExchange(svc, user.id, conversationId, message, reply, structured, []);
      return NextResponse.json({
        message: reply,
        results: [] as CarrierResult[],
        conversation_id: convId,
        structured_query: structured,
      });
    }

    // --- General question: check for searchable terms first ---
    if (structured.intent === "general_question") {
      const hasTerms = structured.conditions.length > 0 || structured.medications.length > 0;

      if (hasTerms) {
        const carrierIds = await resolveCarrierFilter(svc, structured.carrier_filter);

        const [rules, drugs] = await Promise.all([
          searchRules(svc, structured),
          searchDrugRules(svc, structured),
        ]);

        let results = scoreCarrierResults(structured, rules, drugs);

        const structuredCarrierIds = results.map((r) => r.carrier_id);
        const mdHits = await searchMarkdownFallback(svc, structured, structuredCarrierIds);
        if (mdHits.length) {
          const scenarioForSynth = summarizeScenario(structured, message);
          const mdResults = await synthesizeMarkdownHits(scenarioForSynth, mdHits);
          results = [...results, ...mdResults];
        }

        const vOrder: Record<string, number> = { decline: 0, conditional: 1, likely_approve: 2, unknown: 3 };
        results.sort((a, b) => (vOrder[a.verdict] ?? 9) - (vOrder[b.verdict] ?? 9) || b.confidence - a.confidence);
        results = filterResultsByCarrier(results, carrierIds);

        if (results.length > 0) {
          const terms = [...structured.conditions, ...structured.medications].join(", ");
          const carrierNote = structured.carrier_filter.length
            ? ` Focused on: ${structured.carrier_filter.join(", ")}.`
            : "";
          const generalScenario = `General underwriting question about: ${terms}.${carrierNote} ${structured.additional_context ?? message}`;
          const assistantMessage = await explainResults(generalScenario, results);

          const { convId } = await persistExchange(svc, user.id, conversationId, message, assistantMessage, structured, results);
          return NextResponse.json({
            message: assistantMessage,
            results,
            conversation_id: convId,
            structured_query: structured,
          });
        }
      }

      const dbContext = await gatherChatContext(svc, message);
      const reply = await generateConversationalResponse(message, conversationHistory, dbContext);
      const { convId } = await persistExchange(svc, user.id, conversationId, message, reply, structured, []);
      return NextResponse.json({
        message: reply,
        results: [] as CarrierResult[],
        conversation_id: convId,
        structured_query: structured,
      });
    }

    // --- Document request: download flow (applications, rate sheets, producer guides) ---
    if (
      structured.intent === "document_request" ||
      structured.document_request
    ) {
      const reqKind = (structured.document_request?.kind ?? "medsupp_application") as AdminDocumentType;
      const kindLabel = DOCUMENT_TYPE_LABELS[reqKind] ?? reqKind;

      const carrier = await resolveCarrierMention(
        svc,
        structured.document_request?.carrier_mention ?? null,
        message
      );
      if (!carrier) {
        const ask = `Which carrier's ${kindLabel} do you need? (Name only is fine.)`;
        const { convId } = await persistExchange(svc, user.id, conversationId, message, ask, structured, []);
        return NextResponse.json({
          message: ask,
          results: [] as CarrierResult[],
          conversation_id: convId,
          structured_query: structured,
        });
      }

      let doc = await getLatestDownloadableDoc(svc, carrier.id, reqKind);
      let docCarrierName = carrier.name;

      if (!doc) {
        const { data: relatedCarriers } = await svc
          .from("carriers")
          .select("id, name")
          .neq("id", carrier.id)
          .or(`name.ilike.%${carrier.name}%,name.ilike.${carrier.name.split(" ")[0]}%`);

        if (relatedCarriers?.length) {
          for (const rc of relatedCarriers) {
            const found = await getLatestDownloadableDoc(svc, rc.id, reqKind);
            if (found) {
              doc = found;
              docCarrierName = rc.name;
              break;
            }
          }
        }
      }

      if (!doc) {
        const sorry = `No **${carrier.name}** ${kindLabel} is on file yet — ask your admin to upload it.`;
        const { convId } = await persistExchange(svc, user.id, conversationId, message, sorry, structured, []);
        return NextResponse.json({
          message: sorry,
          results: [] as CarrierResult[],
          conversation_id: convId,
          structured_query: structured,
        });
      }

      const url = await createSignedDownloadUrl(svc, doc.storage_path, 3600);
      const reply = url
        ? `**${docCarrierName}** ${kindLabel}: [Download ${doc.filename}](${url}) (link ~1 hr).`
        : `**${docCarrierName}** ${kindLabel} is on file but the download link failed — try again shortly.`;

      const { convId } = await persistExchange(svc, user.id, conversationId, message, reply, structured, []);
      return NextResponse.json({
        message: reply,
        results: [] as CarrierResult[],
        conversation_id: convId,
        structured_query: structured,
      });
    }

    // --- Follow-up: merge new info with the last structured query from history ---
    if (structured.intent === "followup") {
      const lastStructured = extractLastStructuredQuery(conversationHistory);
      if (lastStructured) {
        structured = mergeFollowup(lastStructured, structured);
      }
      // If merged query still has no search terms, fall through to conversational
      const hasTerms = structured.conditions.length > 0 || structured.medications.length > 0;
      if (!hasTerms) {
        const reply = await generateConversationalResponse(message, conversationHistory);
        const { convId } = await persistExchange(svc, user.id, conversationId, message, reply, structured, []);
        return NextResponse.json({
          message: reply,
          results: [] as CarrierResult[],
          conversation_id: convId,
          structured_query: structured,
        });
      }
      // Otherwise fall through to the search pipeline below
    }

    // --- Client scenario (or follow-up with search terms): run the search pipeline ---
    const hasSearchTerms = structured.conditions.length > 0 || structured.medications.length > 0;
    if (!hasSearchTerms) {
      // Even for client_scenario, if there's truly nothing to search, go conversational
      const reply = await generateConversationalResponse(message, conversationHistory);
      const { convId } = await persistExchange(svc, user.id, conversationId, message, reply, structured, []);
      return NextResponse.json({
        message: reply,
        results: [] as CarrierResult[],
        conversation_id: convId,
        structured_query: structured,
      });
    }

    const carrierIds = await resolveCarrierFilter(svc, structured.carrier_filter);

    const [rules, drugs] = await Promise.all([searchRules(svc, structured), searchDrugRules(svc, structured)]);

    let results = scoreCarrierResults(structured, rules, drugs);

    const structuredCarrierIds = results.map((r) => r.carrier_id);
    const mdHits = await searchMarkdownFallback(svc, structured, structuredCarrierIds);
    if (mdHits.length) {
      const scenarioForSynth = summarizeScenario(structured, message);
      const mdResults = await synthesizeMarkdownHits(scenarioForSynth, mdHits);
      results = [...results, ...mdResults];
    }

    const vOrder: Record<string, number> = { decline: 0, conditional: 1, likely_approve: 2, unknown: 3 };
    results.sort((a, b) => (vOrder[a.verdict] ?? 9) - (vOrder[b.verdict] ?? 9) || b.confidence - a.confidence);
    results = filterResultsByCarrier(results, carrierIds);

    if (!results.length) {
      const terms = [...structured.conditions, ...structured.medications].join(", ");
      const fallbackMsg = `I checked ${terms || "that scenario"} but didn't find a match in any carrier's guidelines. Try different wording, add a med name, or mention another condition — happy to run it again.`;
      const { convId } = await persistExchange(svc, user.id, conversationId, message, fallbackMsg, structured, []);
      return NextResponse.json({
        message: fallbackMsg,
        results: [],
        conversation_id: convId,
        structured_query: structured,
      });
    }

    const scenarioSummary = summarizeScenario(structured, message);
    const assistantMessage = await explainResults(scenarioSummary, results);

    const { convId } = await persistExchange(svc, user.id, conversationId, message, assistantMessage, structured, results);

    return NextResponse.json({
      message: assistantMessage,
      results,
      conversation_id: convId,
      structured_query: structured,
    });
  } catch (err) {
    console.error("query route", err);
    return NextResponse.json({ error: "Query pipeline failed" }, { status: 500 });
  }
}

async function persistExchange(
  svc: SupabaseClient,
  userId: string,
  existingConversationId: string | null,
  userContent: string,
  assistantContent: string,
  structured: StructuredQuery | null,
  results: CarrierResult[]
) {
  let convId = existingConversationId;

  if (convId) {
    const { data: owned } = await svc
      .from("conversations")
      .select("id")
      .eq("id", convId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!owned?.id) convId = null;
  }

  if (!convId) {
    const title = userContent.slice(0, 80) + (userContent.length > 80 ? "…" : "");
    const { data: conv, error: cErr } = await svc
      .from("conversations")
      .insert({ user_id: userId, title })
      .select("id")
      .single();
    if (!cErr && conv?.id) convId = conv.id;
  }

  if (convId) {
    try {
      const assistantPayload =
        results.length > 0
          ? ({ version: 1, carrier_results: results } as unknown as Record<string, unknown>)
          : null;
      await svc.from("messages").insert([
        { conversation_id: convId, role: "user", content: userContent, structured_query: null, results: null },
        {
          conversation_id: convId,
          role: "assistant",
          content: assistantContent,
          structured_query: (structured as unknown as Record<string, unknown>) ?? null,
          results: assistantPayload,
        },
      ]);
    } catch (e) {
      console.error("persist messages", e);
    }
  }

  if (convId) {
    setPhiExpiry(convId).catch(() => {});
    logAudit(svc, userId, "query", "conversation", convId, {
      has_conditions: (structured?.conditions?.length ?? 0) > 0,
      has_medications: (structured?.medications?.length ?? 0) > 0,
      result_count: results.length,
    }).catch(() => {});
  }

  return { convId: convId ?? null };
}
