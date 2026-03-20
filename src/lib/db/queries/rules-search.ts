import type { SupabaseClient } from "@supabase/supabase-js";
import type { StructuredQuery } from "@/lib/ai/types";

export interface RuleSearchRow {
  id: string;
  carrier_id: string;
  source_document_id: string | null;
  rule_type: string;
  category: string | null;
  condition_name: string;
  decision: string;
  rule_summary: string;
  rule_detail: string | null;
  confidence_score: number | null;
  applicable_states: string[] | null;
  carriers: { name: string } | { name: string }[] | null;
  source_documents:
    | { filename: string; effective_date: string | null }
    | { filename: string; effective_date: string | null }[]
    | null;
}

function escapeIlike(s: string) {
  return s.replace(/[%_\\]/g, "\\$&");
}

function embedName<T extends { name: string }>(v: T | T[] | null | undefined) {
  if (!v) return null;
  return Array.isArray(v) ? v[0]?.name ?? null : v.name;
}

function embedDoc(v: RuleSearchRow["source_documents"]) {
  if (!v) return { filename: "Carrier guide", effective_date: null as string | null };
  const row = Array.isArray(v) ? v[0] : v;
  return row ?? { filename: "Carrier guide", effective_date: null };
}

/**
 * Search verified medical rules by condition keywords (and optional state filter post-processing).
 */
export async function searchRules(
  supabase: SupabaseClient,
  structured: StructuredQuery
): Promise<RuleSearchRow[]> {
  const terms = [...structured.conditions, ...structured.medications]
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12);

  if (!terms.length) return [];

  const clauses = terms.flatMap((t) => {
    const e = escapeIlike(t);
    return [
      `condition_name.ilike.%${e}%`,
      `rule_summary.ilike.%${e}%`,
      `rule_detail.ilike.%${e}%`,
    ];
  });
  const orClause = clauses.join(",");

  const { data, error } = await supabase
    .from("rules")
    .select(
      "id, carrier_id, source_document_id, rule_type, category, condition_name, decision, rule_summary, rule_detail, confidence_score, applicable_states, carriers(name), source_documents(filename, effective_date)"
    )
    .eq("status", "verified")
    .or(orClause)
    .limit(250);

  if (error) {
    console.error("rules search error", error.message);
    return [];
  }

  const rows = (data ?? []) as RuleSearchRow[];
  const state = structured.state?.toUpperCase() ?? null;

  if (!state) return rows;

  return rows.filter((r) => {
    const states = r.applicable_states;
    if (!states || states.length === 0) return true;
    return states.map((s) => s.toUpperCase()).includes(state);
  });
}

export function ruleRowCitation(r: RuleSearchRow) {
  const doc = embedDoc(r.source_documents);
  return {
    document: doc.filename,
    page: null as number | null,
    section: r.category,
    effective_date: doc.effective_date,
  };
}

export function ruleCarrierName(r: RuleSearchRow) {
  return embedName(r.carriers) ?? "Unknown carrier";
}
