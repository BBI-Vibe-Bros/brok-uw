import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/server";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = await context.params;
  const body = await request.json();
  const supabase = createServiceClient();

  const { data: existing, error: fetchError } = await supabase
    .from("rules")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "Rule not found" }, { status: 404 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.condition_name === "string") patch.condition_name = body.condition_name;
  if (typeof body.rule_summary === "string") patch.rule_summary = body.rule_summary;
  if (typeof body.rule_detail === "string" || body.rule_detail === null) {
    patch.rule_detail = body.rule_detail;
  }
  if (typeof body.decision === "string") patch.decision = body.decision;
  if (typeof body.rule_type === "string") patch.rule_type = body.rule_type;
  if (typeof body.confidence_score === "number") patch.confidence_score = body.confidence_score;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  await supabase.from("rule_versions").insert({
    rule_id: id,
    version: existing.version,
    previous_data: {
      condition_name: existing.condition_name,
      rule_summary: existing.rule_summary,
      rule_detail: existing.rule_detail,
      decision: existing.decision,
      rule_type: existing.rule_type,
    },
    changed_by: auth.userId,
  });

  const { data, error } = await supabase
    .from("rules")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rule: data });
}
