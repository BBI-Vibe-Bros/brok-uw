import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth/admin";
import { createAdminRouteClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const auth = await requireAdminAuth();
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.map(String) : [];
  const status = String(body?.status ?? "").trim();

  if (!ids.length) {
    return NextResponse.json({ error: "ids array required" }, { status: 400 });
  }
  if (!["verified", "rejected", "pending_review"].includes(status)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }

  const supabase = await createAdminRouteClient();
  const { error } = await supabase.from("drug_rules").update({ status }).in("id", ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, updated: ids.length });
}
