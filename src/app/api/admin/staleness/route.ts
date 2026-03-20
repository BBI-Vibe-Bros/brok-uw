import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth/admin";
import { createAdminRouteClient } from "@/lib/supabase/server";
import {
  DOCUMENT_TYPE_MEDSUPP_APPLICATION,
  DOCUMENT_TYPE_UW_GUIDE,
} from "@/lib/documents/document-types";

function monthsSince(isoDate: string | null): number | null {
  if (!isoDate) return null;
  const t = new Date(isoDate).getTime();
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / (1000 * 60 * 60 * 24 * 30.44);
}

function stalenessLabel(months: number | null): "ok" | "warn" | "stale" | "unknown" {
  if (months == null) return "unknown";
  if (months >= 12) return "stale";
  if (months >= 10) return "warn";
  return "ok";
}

export async function GET() {
  const auth = await requireAdminAuth();
  if (auth instanceof NextResponse) return auth;

  const supabase = await createAdminRouteClient();
  const { data: carriers, error: cErr } = await supabase
    .from("carriers")
    .select("id, name, slug, states_available, created_at");
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });

  const { data: docs, error: dErr } = await supabase
    .from("source_documents")
    .select("carrier_id, uploaded_at, effective_date, status, document_type, filename")
    .eq("document_type", DOCUMENT_TYPE_UW_GUIDE)
    .order("uploaded_at", { ascending: false });

  if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });

  const { data: ruleCounts, error: rErr } = await supabase
    .from("rules")
    .select("carrier_id, status");
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });

  const latestByCarrier = new Map<
    string,
    { refDate: string; uploaded_at: string; effective_date: string | null; filename: string | null }
  >();
  const docCountByCarrier = new Map<string, number>();

  for (const d of docs ?? []) {
    if (!d.carrier_id) continue;
    docCountByCarrier.set(d.carrier_id, (docCountByCarrier.get(d.carrier_id) ?? 0) + 1);
    if (d.status !== "processed") continue;
    if (latestByCarrier.has(d.carrier_id)) continue;
    const eff = d.effective_date as string | null;
    const up = d.uploaded_at as string;
    const refDate = eff || up;
    latestByCarrier.set(d.carrier_id, { refDate, uploaded_at: up, effective_date: eff, filename: (d.filename as string | null) ?? null });
  }

  const ruleStatsByCarrier = new Map<string, { verified: number; pending: number; total: number }>();
  for (const r of ruleCounts ?? []) {
    const cid = r.carrier_id as string;
    const entry = ruleStatsByCarrier.get(cid) ?? { verified: 0, pending: 0, total: 0 };
    entry.total++;
    if (r.status === "verified") entry.verified++;
    if (r.status === "pending_review") entry.pending++;
    ruleStatsByCarrier.set(cid, entry);
  }

  const rows = (carriers ?? []).map((c) => {
    const latest = latestByCarrier.get(c.id);
    const m = monthsSince(latest?.refDate ?? null);
    const rStats = ruleStatsByCarrier.get(c.id) ?? { verified: 0, pending: 0, total: 0 };
    return {
      carrier_id: c.id,
      name: c.name,
      slug: c.slug,
      states_available: c.states_available ?? [],
      last_reference_date: latest?.refDate ?? null,
      effective_date: latest?.effective_date ?? null,
      guide_filename: latest?.filename ?? null,
      months_since_update: m != null ? Math.round(m * 10) / 10 : null,
      status: stalenessLabel(m),
      documents_count: docCountByCarrier.get(c.id) ?? 0,
      rules_verified: rStats.verified,
      rules_pending: rStats.pending,
      rules_total: rStats.total,
    };
  });

  const { data: appDocs, error: appErr } = await supabase
    .from("source_documents")
    .select("id, carrier_id, filename, uploaded_at, status")
    .eq("document_type", DOCUMENT_TYPE_MEDSUPP_APPLICATION)
    .order("uploaded_at", { ascending: false });

  if (appErr) return NextResponse.json({ error: appErr.message }, { status: 500 });

  const appsByCarrier = new Map<
    string,
    { id: string; filename: string; uploaded_at: string; status: string }[]
  >();
  for (const d of appDocs ?? []) {
    if (!d.carrier_id) continue;
    const list = appsByCarrier.get(d.carrier_id) ?? [];
    list.push({
      id: d.id as string,
      filename: d.filename as string,
      uploaded_at: d.uploaded_at as string,
      status: d.status as string,
    });
    appsByCarrier.set(d.carrier_id, list);
  }

  const sortedCarriers = [...rows].sort((a, b) =>
    (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" })
  );
  const directory_rows = sortedCarriers.flatMap((g) => {
    const guideRow = {
      row_key: `${g.carrier_id}-uw_guide`,
      row_type: "uw_guide" as const,
      carrier_id: g.carrier_id,
      name: g.name,
      slug: g.slug,
      states_available: g.states_available,
      last_reference_date: g.last_reference_date,
      effective_date: g.effective_date,
      guide_filename: g.guide_filename,
      months_since_update: g.months_since_update,
      freshness: g.status,
      documents_count: g.documents_count,
      rules_verified: g.rules_verified,
      rules_pending: g.rules_pending,
      rules_total: g.rules_total,
      application_filename: null as string | null,
      application_document_id: null as string | null,
      application_uploaded_at: null as string | null,
      application_status: null as string | null,
      chat_ready: null as boolean | null,
    };

    const apps = appsByCarrier.get(g.carrier_id) ?? [];
    const appRows = apps.map((app) => {
      const mu = monthsSince(app.uploaded_at);
      return {
        row_key: `${g.carrier_id}-app-${app.id}`,
        row_type: "medsupp_application" as const,
        carrier_id: g.carrier_id,
        name: g.name,
        slug: g.slug,
        states_available: g.states_available,
        last_reference_date: null,
        effective_date: null,
        months_since_update: mu != null ? Math.round(mu * 10) / 10 : null,
        freshness: null as "ok" | "warn" | "stale" | "unknown" | null,
        documents_count: null as number | null,
        rules_verified: null as number | null,
        rules_pending: null as number | null,
        rules_total: null as number | null,
        application_filename: app.filename,
        application_document_id: app.id,
        application_uploaded_at: app.uploaded_at,
        application_status: app.status,
        chat_ready: app.status === "processed",
      };
    });

    return [guideRow, ...appRows];
  });

  return NextResponse.json({ carriers: rows, directory_rows });
}
