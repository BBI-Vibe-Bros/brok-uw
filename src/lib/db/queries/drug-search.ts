import type { SupabaseClient } from "@supabase/supabase-js";
import type { StructuredQuery } from "@/lib/ai/types";

export interface DrugSearchRow {
  id: string;
  carrier_id: string;
  source_document_id: string | null;
  drug_name: string;
  condition_trigger: string;
  decision: string;
  notes: string | null;
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

function embedDoc(v: DrugSearchRow["source_documents"]) {
  if (!v) return { filename: "Drug list", effective_date: null as string | null };
  const row = Array.isArray(v) ? v[0] : v;
  return row ?? { filename: "Drug list", effective_date: null };
}

/**
 * Search verified drug rules by medication keywords.
 */
export async function searchDrugRules(
  supabase: SupabaseClient,
  structured: StructuredQuery
): Promise<DrugSearchRow[]> {
  const terms = structured.medications.map((s) => s.trim()).filter(Boolean).slice(0, 12);
  if (!terms.length) return [];

  const clauses = terms.flatMap((t) => {
    const e = escapeIlike(t);
    return [`drug_name.ilike.%${e}%`, `condition_trigger.ilike.%${e}%`, `notes.ilike.%${e}%`];
  });

  const { data, error } = await supabase
    .from("drug_rules")
    .select(
      "id, carrier_id, source_document_id, drug_name, condition_trigger, decision, notes, carriers(name), source_documents(filename, effective_date)"
    )
    .eq("status", "verified")
    .or(clauses.join(","))
    .limit(150);

  if (error) {
    console.error("drug search error", error.message);
    return [];
  }

  return (data ?? []) as DrugSearchRow[];
}

export function drugRowCitation(r: DrugSearchRow) {
  const doc = embedDoc(r.source_documents);
  return {
    document: doc.filename,
    page: null as number | null,
    section: `Drug: ${r.drug_name}`,
    effective_date: doc.effective_date,
  };
}

export function drugCarrierName(r: DrugSearchRow) {
  return embedName(r.carriers) ?? "Unknown carrier";
}
