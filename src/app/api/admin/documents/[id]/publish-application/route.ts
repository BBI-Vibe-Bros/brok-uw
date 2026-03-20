import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth/admin";
import { createAdminRouteClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit/log";
import { DOCUMENT_TYPE_MEDSUPP_APPLICATION } from "@/lib/documents/document-types";

/**
 * Mark a Med Supp application PDF as available to agents in chat (no rule extraction).
 */
export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminAuth();
  if (auth instanceof NextResponse) return auth;

  const { id: documentId } = await context.params;
  const supabase = await createAdminRouteClient();
  const now = new Date().toISOString();

  const { data: doc, error: docError } = await supabase
    .from("source_documents")
    .select("id, carrier_id, document_type, status")
    .eq("id", documentId)
    .single();

  if (docError || !doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  if (doc.document_type !== DOCUMENT_TYPE_MEDSUPP_APPLICATION) {
    return NextResponse.json({ error: "Only Med Supp application uploads can use this action" }, { status: 400 });
  }

  if (doc.status !== "uploaded" && doc.status !== "failed") {
    return NextResponse.json(
      {
        error:
          "Application must be freshly uploaded (or failed recoverable) to publish — check Documents in admin or upload again.",
      },
      { status: 400 }
    );
  }

  const { error: upErr } = await supabase
    .from("source_documents")
    .update({
      status: "processed",
      marker_json: {
        agent_download: true,
        activated_at: now,
        activated_by: auth.userId,
      },
    })
    .eq("id", documentId);

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  logAudit(supabase, auth.userId, "admin.publish_application", "source_document", documentId, {
    carrier_id: doc.carrier_id,
  }).catch(() => {});

  return NextResponse.json({ success: true });
}
