import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdminAuth } from "@/lib/auth/admin";

function buildSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export async function GET() {
  const auth = await requireAdminAuth();
  if (auth instanceof NextResponse) {
    return auth;
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("carriers")
    .select("id, name, slug, states_available, created_at")
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ carriers: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminAuth();
  if (auth instanceof NextResponse) {
    return auth;
  }

  const body = await request.json();
  const name = String(body?.name ?? "").trim();
  const slugInput = String(body?.slug ?? "").trim();
  const statesRaw = String(body?.states_available ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  if (!name) {
    return NextResponse.json({ error: "Carrier name is required" }, { status: 400 });
  }

  const slug = slugInput ? buildSlug(slugInput) : buildSlug(name);
  if (!slug) {
    return NextResponse.json({ error: "Invalid carrier slug" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("carriers")
    .insert({
      name,
      slug,
      states_available: statesRaw,
    })
    .select("id, name, slug, states_available, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ carrier: data }, { status: 201 });
}
