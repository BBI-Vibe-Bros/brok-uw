import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { lookupNPN } from "@/lib/utils/brock-portal-lookup";
import { logAudit } from "@/lib/audit/log";

export async function POST(request: NextRequest) {
  const { full_name, phone, email, npn, password } = await request.json();

  if (!full_name || !email || !npn || !password) {
    return NextResponse.json(
      { error: "Name, email, NPN, and password are required" },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();

  const portalAgent = await lookupNPN(npn);
  const isBrockAgent = portalAgent !== null;

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name,
      npn,
    },
  });

  if (authError) {
    if (authError.message?.includes("already been registered")) {
      return NextResponse.json(
        { error: "An account with this email already exists. Please log in." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: authError.message }, { status: 500 });
  }

  const userId = authData.user.id;

  const { error: profileError } = await supabase.from("profiles").insert({
    id: userId,
    full_name,
    phone: phone || null,
    email,
    npn,
    role: "agent",
    subscription_tier: isBrockAgent ? "brock_agent" : "lead",
    is_brock_agent: isBrockAgent,
    states_licensed: portalAgent?.states_licensed
      ? portalAgent.states_licensed.split(",").map((s: string) => s.trim())
      : null,
  });

  if (profileError) {
    console.error("Profile creation failed:", profileError);
  }

  logAudit(supabase, userId, "signup", "profile", userId, {
    is_brock_agent: isBrockAgent,
    npn,
  }).catch(() => {});

  return NextResponse.json({
    success: true,
    is_brock_agent: isBrockAgent,
    user_id: userId,
  });
}
