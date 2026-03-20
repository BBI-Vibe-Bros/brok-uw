import type { SupabaseClient } from "@supabase/supabase-js";
import type { StructuredQuery } from "@/lib/ai/types";

export interface MarkdownHit {
  carrier_id: string;
  carrier_name: string;
  document_id: string;
  filename: string;
  effective_date: string | null;
  /** Snippets (up to ~600 chars each) that matched a search term. */
  snippets: string[];
}

const SNIPPET_RADIUS = 300;

function extractSnippets(markdown: string, terms: string[], max: number): string[] {
  const lower = markdown.toLowerCase();
  const out: string[] = [];
  const seen = new Set<number>();

  for (const term of terms) {
    let idx = 0;
    const tLower = term.toLowerCase();
    while (idx < lower.length && out.length < max) {
      const pos = lower.indexOf(tLower, idx);
      if (pos === -1) break;

      const bucket = Math.floor(pos / SNIPPET_RADIUS);
      if (!seen.has(bucket)) {
        seen.add(bucket);
        const start = Math.max(0, pos - SNIPPET_RADIUS);
        const end = Math.min(markdown.length, pos + term.length + SNIPPET_RADIUS);
        out.push(markdown.slice(start, end).replace(/\n{3,}/g, "\n\n").trim());
      }
      idx = pos + term.length;
    }
  }
  return out;
}

/**
 * Full-text search against `source_documents.extracted_markdown`.
 * Only called as a **fallback** when structured rules search returned
 * fewer carriers than expected.
 */
export async function searchMarkdownFallback(
  supabase: SupabaseClient,
  structured: StructuredQuery,
  excludeCarrierIds: string[]
): Promise<MarkdownHit[]> {
  const terms = [...structured.conditions, ...structured.medications]
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8);

  if (!terms.length) return [];

  const { data: docs, error } = await supabase
    .from("source_documents")
    .select("id, carrier_id, filename, effective_date, extracted_markdown, carriers(name)")
    .eq("document_type", "uw_guide")
    .eq("status", "processed")
    .not("extracted_markdown", "is", null);

  if (error || !docs?.length) return [];

  const hits: MarkdownHit[] = [];

  for (const doc of docs) {
    if (excludeCarrierIds.includes(doc.carrier_id)) continue;

    const md: string = (doc.extracted_markdown as string) ?? "";
    if (!md) continue;

    const mdLower = md.toLowerCase();
    const matched = terms.filter((t) => mdLower.includes(t.toLowerCase()));
    if (!matched.length) continue;

    const carrierRaw = doc.carriers as { name: string } | { name: string }[] | null;
    const carrierName = carrierRaw
      ? Array.isArray(carrierRaw)
        ? carrierRaw[0]?.name ?? "Unknown"
        : carrierRaw.name
      : "Unknown";

    const snippets = extractSnippets(md, matched, 6);

    hits.push({
      carrier_id: doc.carrier_id,
      carrier_name: carrierName,
      document_id: doc.id as string,
      filename: doc.filename as string,
      effective_date: (doc.effective_date as string) ?? null,
      snippets,
    });
  }

  return hits;
}
