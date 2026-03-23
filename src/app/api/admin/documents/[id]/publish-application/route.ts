import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth/admin";
import { createAdminRouteClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit/log";
import { DOC_TYPE_META, type AdminDocumentType } from "@/lib/documents/document-types";

/**
 * Mark a document as available/published (no rule extraction).
 * Works for any downloadable or reference-only document type.
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

  const meta = DOC_TYPE_META[doc.document_type as AdminDocumentType];
  if (meta?.canExtract && doc.status !== "uploaded" && doc.status !== "failed") {
    return NextResponse.json(
      { error: "Extractable docs should go through the extraction flow instead." },
      { status: 400 }
    );
  }

  if (doc.status !== "uploaded" && doc.status !== "failed") {
    return NextResponse.json(
      { error: "Document must be freshly uploaded (or failed) to publish. Upload again if needed." },
      { status: 400 }
    );
  }

  const { error: upErr } = await supabase
    .from("source_documents")
    .update({
      status: "processed",
      marker_json: {
        agent_download: meta?.isDownloadable ?? false,
        reference_only: meta?.canExtract ? true : false,
        activated_at: now,
        activated_by: auth.userId,
      },
    })
    .eq("id", documentId);

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  logAudit(supabase, auth.userId, "admin.publish_document", "source_document", documentId, {
    carrier_id: doc.carrier_id,
    document_type: doc.document_type,
  }).catch(() => {});

  return NextResponse.json({ success: true });
}
