import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = await context.params;
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("source_documents")
    .select(
      "id, carrier_id, filename, document_type, version, status, uploaded_at, effective_date, marker_json, carriers(name)"
    )
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  return NextResponse.json({ document: data });
}
