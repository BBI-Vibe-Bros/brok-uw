import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth/admin";
import { createAdminRouteClient } from "@/lib/supabase/server";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = await context.params;
  const body = await request.json();
  const supabase = await createAdminRouteClient();

  const patch: Record<string, unknown> = {};
  if (typeof body.drug_name === "string") patch.drug_name = body.drug_name;
  if (typeof body.condition_trigger === "string") patch.condition_trigger = body.condition_trigger;
  if (typeof body.decision === "string") patch.decision = body.decision;
  if (typeof body.notes === "string" || body.notes === null) patch.notes = body.notes;
  if (typeof body.is_conditional === "boolean") patch.is_conditional = body.is_conditional;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("drug_rules")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ drug_rule: data });
}
