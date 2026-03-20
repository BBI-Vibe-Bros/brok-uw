import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const auth = await requireAdminAuth();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? "pending_review";
  const carrierId = searchParams.get("carrier_id");
  const documentId = searchParams.get("document_id");
  const limit = Math.min(Number(searchParams.get("limit") ?? 200), 500);

  const supabase = createServiceClient();
  let q = supabase
    .from("rules")
    .select(
      "id, carrier_id, source_document_id, rule_type, category, condition_name, decision, rule_summary, rule_detail, confidence_score, status, version, created_at, carriers(name), source_documents(filename)"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status && status !== "all") {
    q = q.eq("status", status);
  }
  if (carrierId) q = q.eq("carrier_id", carrierId);
  if (documentId) q = q.eq("source_document_id", documentId);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rules: data ?? [] });
}
