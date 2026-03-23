"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

type Freshness = "ok" | "warn" | "stale" | "unknown";

export interface DirectoryRow {
  row_key: string;
  row_type: string;
  carrier_id: string;
  name: string;
  slug: string;
  states_available: string[];
  last_reference_date: string | null;
  effective_date: string | null;
  guide_filename: string | null;
  months_since_update: number | null;
  freshness: Freshness | null;
  documents_count: number | null;
  rules_verified: number | null;
  rules_pending: number | null;
  rules_total: number | null;
  doc_filename: string | null;
  doc_id: string | null;
  doc_uploaded_at: string | null;
  doc_status: string | null;
  doc_type_label: string;
  chat_ready: boolean | null;
}

const freshnessColors: Record<string, string> = {
  ok: "bg-emerald-100 text-emerald-800",
  warn: "bg-amber-100 text-amber-800",
  stale: "bg-red-100 text-red-800",
  unknown: "bg-slate-100 text-slate-600",
};

const freshnessLabels: Record<string, string> = {
  ok: "Current",
  warn: "Getting Old",
  stale: "Needs Update",
  unknown: "No Guide Yet",
};

function statusPill(row: DirectoryRow) {
  if (row.row_type === "uw_guide" && row.freshness) {
    return {
      className: freshnessColors[row.freshness],
      text: freshnessLabels[row.freshness],
    };
  }
  if (row.chat_ready) return { className: "bg-blue-100 text-blue-800", text: "In Chat" };
  if (row.doc_status === "uploaded") return { className: "bg-amber-100 text-amber-900", text: "Not In Chat" };
  if (row.doc_status === "failed") return { className: "bg-red-100 text-red-900", text: "Failed" };
  if (row.doc_status === "processing") return { className: "bg-slate-200 text-slate-800", text: "Processing" };
  if (row.doc_status === "processed") return { className: "bg-blue-100 text-blue-800", text: "Ready" };
  return null;
}

function referenceCell(row: DirectoryRow) {
  const fn = row.doc_filename ?? row.guide_filename;
  if (!fn) return "—";
  return (
    <span className="block max-w-[200px] sm:max-w-[280px] truncate" title={fn}>
      {fn}
    </span>
  );
}

function uploadedDateCell(row: DirectoryRow) {
  const raw = row.row_type === "uw_guide"
    ? row.last_reference_date
    : row.doc_uploaded_at;
  return raw ? new Date(raw).toLocaleDateString() : "—";
}

type SortKey = "carrier" | "type" | "uploaded" | "status";
type SortDir = "asc" | "desc";

const STATUS_RANK: Record<string, number> = { stale: 0, warn: 1, ok: 2, unknown: 3 };

function uploadedTimestamp(row: DirectoryRow): number {
  const raw = row.row_type === "uw_guide" ? row.last_reference_date : row.doc_uploaded_at;
  if (!raw) return 0;
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function statusRank(row: DirectoryRow): number {
  if (row.row_type === "uw_guide") return STATUS_RANK[row.freshness ?? "unknown"] ?? 3;
  if (row.chat_ready) return 2;
  if (row.doc_status === "uploaded") return 1;
  if (row.doc_status === "failed") return 0;
  return 3;
}

function sortRows(rows: DirectoryRow[], key: SortKey, dir: SortDir): DirectoryRow[] {
  const m = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case "carrier":
        cmp = a.name.localeCompare(b.name);
        break;
      case "type":
        cmp = a.doc_type_label.localeCompare(b.doc_type_label);
        break;
      case "uploaded":
        cmp = uploadedTimestamp(a) - uploadedTimestamp(b);
        break;
      case "status":
        cmp = statusRank(a) - statusRank(b);
        break;
    }
    return cmp === 0 ? a.row_key.localeCompare(b.row_key) : cmp * m;
  });
}

function SortHeader({
  label,
  sortKey,
  active,
  dir,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  active: boolean;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  return (
    <th className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 font-medium hover:text-slate-900 transition-colors"
      >
        {label}
        <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 14 14" fill="none">
          <path
            d="M7 3L10 6.5H4L7 3Z"
            fill={active && dir === "asc" ? "currentColor" : "#cbd5e1"}
          />
          <path
            d="M7 11L4 7.5H10L7 11Z"
            fill={active && dir === "desc" ? "currentColor" : "#cbd5e1"}
          />
        </svg>
      </button>
    </th>
  );
}

export function CarrierDirectory() {
  const [rows, setRows] = useState<DirectoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("carrier");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sorted = useMemo(() => sortRows(rows, sortKey, sortDir), [rows, sortKey, sortDir]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/staleness");
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed");
      setRows((j.directory_rows ?? []) as DirectoryRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const carrierCount = new Set(sorted.map((r) => r.carrier_id)).size;

  if (loading) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Loading directory…</p>;
  }
  if (error) {
    return <p className="text-sm text-red-600 py-4">{error}</p>;
  }
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No carriers yet. Switch to <strong>Ingest</strong> and create one.
      </p>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {carrierCount} carrier{carrierCount !== 1 ? "s" : ""} · {sorted.length} row{sorted.length !== 1 ? "s" : ""}
        </p>
        <Button type="button" variant="outline" size="sm" className="shrink-0 self-start sm:self-auto" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {/* Mobile / narrow: stacked cards */}
      <div className="space-y-3 md:hidden">
        {sorted.map((r) => {
          const pill = statusPill(r);
          return (
            <div key={r.row_key} className="rounded-lg border bg-white p-4 text-sm shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-2 mb-2">
                <div className="min-w-0">
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs text-muted-foreground">{r.slug}</div>
                </div>
                <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-800">
                  {r.doc_type_label}
                </span>
              </div>
              <dl className="grid grid-cols-1 gap-1.5 text-xs sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">States</dt>
                  <dd className="break-words">{r.states_available.length ? r.states_available.join(", ") : "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Reference</dt>
                  <dd className="break-all">{referenceCell(r)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Uploaded</dt>
                  <dd>{uploadedDateCell(r)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Status</dt>
                  <dd>
                    {pill ? (
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${pill.className}`}>
                        {pill.text}
                      </span>
                    ) : "—"}
                  </dd>
                </div>
                {r.row_type === "uw_guide" && (
                  <>
                    <div>
                      <dt className="text-muted-foreground">Guide uploads</dt>
                      <dd className="tabular-nums">{r.documents_count ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Rules (ok / pend)</dt>
                      <dd className="tabular-nums">
                        {r.rules_verified ?? "—"} / {r.rules_pending ?? "—"}
                      </dd>
                    </div>
                  </>
                )}
              </dl>
            </div>
          );
        })}
      </div>

      {/* md+: table */}
      <div className="hidden md:block w-full overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b bg-slate-50">
              <SortHeader label="Carrier" sortKey="carrier" active={sortKey === "carrier"} dir={sortDir} onSort={handleSort} className="sticky left-0 z-10 bg-slate-50 px-3 py-3 whitespace-nowrap" />
              <SortHeader label="Type" sortKey="type" active={sortKey === "type"} dir={sortDir} onSort={handleSort} className="px-3 py-3 whitespace-nowrap" />
              <th className="px-3 py-3 font-medium min-w-[120px]">States</th>
              <th className="px-3 py-3 font-medium whitespace-nowrap">Reference</th>
              <SortHeader label="Uploaded" sortKey="uploaded" active={sortKey === "uploaded"} dir={sortDir} onSort={handleSort} className="px-3 py-3 whitespace-nowrap" />
              <SortHeader label="Status" sortKey="status" active={sortKey === "status"} dir={sortDir} onSort={handleSort} className="px-3 py-3 whitespace-nowrap" />
              <th className="px-3 py-3 font-medium text-right whitespace-nowrap">Guides #</th>
              <th className="px-3 py-3 font-medium text-right whitespace-nowrap">Rules ✓</th>
              <th className="px-3 py-3 font-medium text-right whitespace-nowrap">Pend</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const pill = statusPill(r);
              return (
                <tr key={r.row_key} className="border-b last:border-b-0 hover:bg-slate-50/60 transition-colors">
                  <td className="sticky left-0 z-10 border-r border-slate-100 bg-white px-3 py-2.5 align-top shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                    <div className="font-medium whitespace-nowrap">{r.name}</div>
                    <div className="text-xs text-muted-foreground">{r.slug}</div>
                  </td>
                  <td className="px-3 py-2.5 align-top whitespace-nowrap text-xs font-medium text-slate-800">
                    {r.doc_type_label}
                  </td>
                  <td className="px-3 py-2.5 align-top text-muted-foreground">
                    <span className="line-clamp-2" title={r.states_available.join(", ")}>
                      {r.states_available.length > 0 ? r.states_available.join(", ") : "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 align-top">{referenceCell(r)}</td>
                  <td className="px-3 py-2.5 align-top whitespace-nowrap tabular-nums">
                    {uploadedDateCell(r)}
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    {pill ? (
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${pill.className}`}>
                        {pill.text}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-3 py-2.5 align-top text-right tabular-nums text-muted-foreground">
                    {r.row_type === "uw_guide" ? r.documents_count ?? "—" : "—"}
                  </td>
                  <td className="px-3 py-2.5 align-top text-right tabular-nums">
                    {r.row_type === "uw_guide" ? r.rules_verified ?? "—" : "—"}
                  </td>
                  <td className="px-3 py-2.5 align-top text-right tabular-nums">
                    {r.row_type === "uw_guide" ? (
                      r.rules_pending != null && r.rules_pending > 0 ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                          {r.rules_pending}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )
                    ) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
