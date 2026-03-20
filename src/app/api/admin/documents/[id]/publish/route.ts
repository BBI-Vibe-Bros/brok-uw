import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth/admin";
import { createAdminRouteClient } from "@/lib/supabase/server";

/**
 * Verify all pending rules/drug_rules for this document and supersede
 * other verified rules for the same carrier (new guide replaces old).
 */
export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminAuth();
  if (auth instanceof NextResponse) return auth;

  const { id: documentId } = await context.params;
  const supabase = await createAdminRouteClient();
  const now = new Date().toISOString();

  const { data: doc, error: docError } = await supabase
    .from("source_documents")
    .select("id, carrier_id")
    .eq("id", documentId)
    .single();

  if (docError || !doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const { data: oldRules } = await supabase
    .from("rules")
    .select(
      "id, version, condition_name, rule_summary, rule_detail, decision, rule_type, carrier_id, source_document_id, status"
    )
    .eq("carrier_id", doc.carrier_id)
    .eq("status", "verified")
    .neq("source_document_id", documentId);

  if (oldRules?.length) {
    const snapshots = oldRules.map((r) => ({
      rule_id: r.id,
      version: r.version,
      previous_data: r,
      changed_by: auth.userId,
    }));
    const { error: verErr } = await supabase.from("rule_versions").insert(snapshots);
    if (verErr) {
      return NextResponse.json({ error: verErr.message }, { status: 500 });
    }
  }

  if (oldRules?.length) {
    await supabase
      .from("rules")
      .update({ status: "superseded" })
      .eq("carrier_id", doc.carrier_id)
      .eq("status", "verified")
      .neq("source_document_id", documentId);
  }

  await supabase
    .from("rules")
    .update({
      status: "verified",
      verified_by: auth.userId,
      verified_at: now,
    })
    .eq("source_document_id", documentId)
    .eq("status", "pending_review");

  await supabase
    .from("drug_rules")
    .update({ status: "superseded" })
    .eq("carrier_id", doc.carrier_id)
    .eq("status", "verified")
    .neq("source_document_id", documentId);

  await supabase
    .from("drug_rules")
    .update({ status: "verified" })
    .eq("source_document_id", documentId)
    .eq("status", "pending_review");

  return NextResponse.json({
    success: true,
    superseded_rules: oldRules?.length ?? 0,
  });
}
