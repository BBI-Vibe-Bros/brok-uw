import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseUserQuery } from "@/lib/ai/prompts/parse-query";
import { explainResults } from "@/lib/ai/prompts/explain-results";
import { searchDrugRules } from "@/lib/db/queries/drug-search";
import { searchRules } from "@/lib/db/queries/rules-search";
import { getLatestMedsuppApplicationForCarrier } from "@/lib/db/queries/medsupp-applications";
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

function wantsCarrierList(message: string): boolean {
  const m = message.toLowerCase();
  return (
    (m.includes("carrier") && (m.includes("available") || m.includes("list") || m.includes("what") || m.includes("have"))) ||
    m.includes("which carriers") ||
    m.includes("guidelines for")
  );
}

/** If the model omits `document_request`, still catch obvious app/download phrasing. */
function heuristicMedsuppApplicationRequest(message: string): boolean {
  const m = message.toLowerCase();
  const intent = /(send|give|get|download|link|need|where is|file|copy of|pdf|attach)/i.test(message);
  const wantsArtifact =
    m.includes("application") || m.includes("enrollment form") || /\bapp\b/i.test(m);
  const productCue =
    m.includes("med supp") ||
    m.includes("medsupp") ||
    m.includes("medicare supplement") ||
    m.includes("medicare supp") ||
    (m.includes("medicare") && m.includes("supp")) ||
    (m.includes("application") && m.includes("pdf"));
  return intent && wantsArtifact && productCue;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const svcForProfile = createServiceClient();
  const { data: profile } = await svcForProfile
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

  const svc = createServiceClient();
  let conversationId = conversationIdInput;

  try {
    if (wantsCarrierList(message)) {
      const { data: carriers } = await svc.from("carriers").select("name, slug, states_available").order("name");
      const names = (carriers ?? []).map((c) => `• ${c.name}`);
      const assistantText =
        names.length > 0
          ? `Here are the carriers I can help you compare right now:\n\n${names.join("\n")}\n\nAsk me about a specific client scenario whenever you're ready.`
          : "I'm not seeing any carriers on file yet — once those are added, I can walk through scenarios with you.";

      const { convId } = await persistExchange(svc, user.id, conversationId, message, assistantText, null, []);
      return NextResponse.json({
        message: assistantText,
        results: [] as CarrierResult[],
        conversation_id: convId,
        structured_query: null,
      });
    }

    let structured: StructuredQuery;
    try {
      structured = await parseUserQuery(message, conversationHistory);
      if (!structured.document_request && heuristicMedsuppApplicationRequest(message)) {
        structured = {
          ...structured,
          document_request: { kind: "medsupp_application", carrier_mention: null },
        };
      }
    } catch (err) {
      const hasKey =
        Boolean(process.env.OPENAI_API_KEY?.trim()) || Boolean(process.env.ANTHROPIC_API_KEY?.trim());
      if (!hasKey) {
        return NextResponse.json(
          {
            error:
              "I'm not able to think that one through yet — the app needs an AI key configured on the server side. If you're not the one who set this up flag someone who is.",
          },
          { status: 503 }
        );
      }
      console.error("parseUserQuery", err);
      return NextResponse.json(
        {
          error:
            "Hmm — I tripped on that one. Mind taking another swing with the client's conditions and meds in everyday language?",
        },
        { status: 502 }
      );
    }

    if (structured.document_request?.kind === "medsupp_application") {
      const carrier = await resolveCarrierMention(
        svc,
        structured.document_request.carrier_mention,
        message
      );
      if (!carrier) {
        const ask = "Which carrier's Med Supp application do you need? (Name only is fine.)";
        const { convId } = await persistExchange(svc, user.id, conversationId, message, ask, structured, []);
        return NextResponse.json({
          message: ask,
          results: [] as CarrierResult[],
          conversation_id: convId,
          structured_query: structured,
        });
      }

      const appDoc = await getLatestMedsuppApplicationForCarrier(svc, carrier.id);
      if (!appDoc) {
        const sorry = `No **${carrier.name}** Med Supp application is on file yet — ask your admin to upload it.`;
        const { convId } = await persistExchange(svc, user.id, conversationId, message, sorry, structured, []);
        return NextResponse.json({
          message: sorry,
          results: [] as CarrierResult[],
          conversation_id: convId,
          structured_query: structured,
        });
      }

      const url = await createSignedDownloadUrl(svc, appDoc.storage_path, 3600);
      const reply = url
        ? `**${carrier.name}** Med Supp app: [Download ${appDoc.filename}](${url}) (link ~1 hr).`
        : `**${carrier.name}** app is on file but the download link failed — try again shortly.`;

      const { convId } = await persistExchange(svc, user.id, conversationId, message, reply, structured, []);
      return NextResponse.json({
        message: reply,
        results: [] as CarrierResult[],
        conversation_id: convId,
        structured_query: structured,
      });
    }

    const hasSearchTerms = structured.conditions.length > 0 || structured.medications.length > 0;
    if (!hasSearchTerms && structured.missing_fields.length > 0) {
      const ask = `I'd love to help — I'm just missing a few pieces. Could you fill me in on ${structured.missing_fields.join(", ")}? Even a quick rundown of conditions or prescriptions helps.`;
      const { convId } = await persistExchange(svc, user.id, conversationId, message, ask, structured, []);
      return NextResponse.json({
        message: ask,
        results: [],
        conversation_id: convId,
        structured_query: structured,
      });
    }

    if (!hasSearchTerms) {
      const ask =
        "Sure thing — what conditions are we working with, and any prescriptions worth calling out? Once I have that, I can stack up how different carriers might treat the case.";
      const { convId } = await persistExchange(svc, user.id, conversationId, message, ask, structured, []);
      return NextResponse.json({
        message: ask,
        results: [],
        conversation_id: convId,
        structured_query: structured,
      });
    }

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

    if (!results.length) {
      const terms = [...structured.conditions, ...structured.medications].join(", ");
      const fallbackMsg = `I ran a pass on ${terms || "that scenario"} but didn't get a clean match back from any carrier lines. Want to try different wording, add a med name, or tell me if there's another condition on the app? I'm happy to run it again.`;
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
  svc: ReturnType<typeof createServiceClient>,
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
