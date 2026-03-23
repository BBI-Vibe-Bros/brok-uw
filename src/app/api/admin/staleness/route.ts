import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth/admin";
import { createAdminRouteClient } from "@/lib/supabase/server";
import {
  EXTRACTABLE_DOC_TYPES,
  DOWNLOADABLE_DOC_TYPES,
  DOCUMENT_TYPE_LABELS,
  type AdminDocumentType,
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

  const { data: allDocs, error: dErr } = await supabase
    .from("source_documents")
    .select("id, carrier_id, uploaded_at, effective_date, status, document_type, filename")
    .order("uploaded_at", { ascending: false });

  if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });

  const { data: ruleCounts, error: rErr } = await supabase
    .from("rules")
    .select("carrier_id, status");
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });

  const extractableSet = new Set<string>(EXTRACTABLE_DOC_TYPES);
  const downloadableSet = new Set<string>(DOWNLOADABLE_DOC_TYPES);

  const latestGuideByCarrier = new Map<
    string,
    { refDate: string; uploaded_at: string; effective_date: string | null; filename: string | null }
  >();
  const guideCountByCarrier = new Map<string, number>();

  interface SupDoc {
    id: string;
    carrier_id: string;
    filename: string;
    uploaded_at: string;
    status: string;
    document_type: string;
  }
  const supplementalDocs: SupDoc[] = [];

  for (const d of allDocs ?? []) {
    if (!d.carrier_id) continue;
    const dt = d.document_type as string;

    if (extractableSet.has(dt)) {
      guideCountByCarrier.set(d.carrier_id, (guideCountByCarrier.get(d.carrier_id) ?? 0) + 1);
      if (d.status === "processed" && !latestGuideByCarrier.has(d.carrier_id)) {
        const eff = d.effective_date as string | null;
        const up = d.uploaded_at as string;
        latestGuideByCarrier.set(d.carrier_id, {
          refDate: eff || up,
          uploaded_at: up,
          effective_date: eff,
          filename: (d.filename as string | null) ?? null,
        });
      }
    }

    if (downloadableSet.has(dt) || (extractableSet.has(dt) && d.status === "processed")) {
      supplementalDocs.push({
        id: d.id as string,
        carrier_id: d.carrier_id,
        filename: d.filename as string,
        uploaded_at: d.uploaded_at as string,
        status: d.status as string,
        document_type: dt,
      });
    }
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
    const latest = latestGuideByCarrier.get(c.id);
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
      documents_count: guideCountByCarrier.get(c.id) ?? 0,
      rules_verified: rStats.verified,
      rules_pending: rStats.pending,
      rules_total: rStats.total,
    };
  });

  const sortedCarriers = [...rows].sort((a, b) =>
    (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" })
  );

  const docsByCarrier = new Map<string, SupDoc[]>();
  for (const d of supplementalDocs) {
    const list = docsByCarrier.get(d.carrier_id) ?? [];
    list.push(d);
    docsByCarrier.set(d.carrier_id, list);
  }

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
      doc_filename: g.guide_filename,
      doc_id: null as string | null,
      doc_uploaded_at: null as string | null,
      doc_status: null as string | null,
      doc_type_label: "Underwriting Guide",
      chat_ready: null as boolean | null,
    };

    const cDocs = docsByCarrier.get(g.carrier_id) ?? [];
    const seen = new Set<string>();

    const extraRows = cDocs
      .filter((d) => {
        if (d.document_type === "uw_guide") return false;
        const key = `${d.carrier_id}-${d.document_type}-${d.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((d) => {
        const mu = monthsSince(d.uploaded_at);
        const dtLabel = DOCUMENT_TYPE_LABELS[d.document_type as AdminDocumentType] ?? d.document_type;
        return {
          row_key: `${g.carrier_id}-${d.document_type}-${d.id}`,
          row_type: d.document_type as string,
          carrier_id: g.carrier_id,
          name: g.name,
          slug: g.slug,
          states_available: g.states_available,
          last_reference_date: null as string | null,
          effective_date: null as string | null,
          guide_filename: null as string | null,
          months_since_update: mu != null ? Math.round(mu * 10) / 10 : null,
          freshness: null as "ok" | "warn" | "stale" | "unknown" | null,
          documents_count: null as number | null,
          rules_verified: null as number | null,
          rules_pending: null as number | null,
          rules_total: null as number | null,
          doc_filename: d.filename,
          doc_id: d.id,
          doc_uploaded_at: d.uploaded_at,
          doc_status: d.status,
          doc_type_label: dtLabel,
          chat_ready: d.status === "processed",
        };
      });

    return [guideRow, ...extraRows];
  });

  return NextResponse.json({ carriers: rows, directory_rows });
}
