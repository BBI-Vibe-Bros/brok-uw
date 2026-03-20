import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth/admin";
import { createAdminRouteClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit/log";

export async function POST(request: NextRequest) {
  const auth = await requireAdminAuth();
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.map(String) : [];
  const statusRaw = String(body?.status ?? "").trim();
  const status = statusRaw as "verified" | "rejected" | "pending_review";

  if (!ids.length) {
    return NextResponse.json({ error: "ids array required" }, { status: 400 });
  }
  if (!["verified", "rejected", "pending_review"].includes(statusRaw)) {
    return NextResponse.json({ error: "status must be verified, rejected, or pending_review" }, { status: 400 });
  }

  const supabase = await createAdminRouteClient();
  const now = new Date().toISOString();

  const patch: Record<string, unknown> = { status };
  if (status === "verified") {
    patch.verified_by = auth.userId;
    patch.verified_at = now;
  } else {
    patch.verified_by = null;
    patch.verified_at = null;
  }

  const { error } = await supabase.from("rules").update(patch).in("id", ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const action = status === "verified" ? "admin.approve_rule" : "admin.reject_rule";
  logAudit(supabase, auth.userId, action, "rule", ids.join(","), {
    count: ids.length,
    status,
  }).catch(() => {});

  return NextResponse.json({ success: true, updated: ids.length });
}
