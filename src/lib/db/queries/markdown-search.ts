import type { SupabaseClient } from "@supabase/supabase-js";
import type { StructuredQuery } from "@/lib/ai/types";
import { EXTRACTABLE_DOC_TYPES } from "@/lib/documents/document-types";

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
    .in("document_type", EXTRACTABLE_DOC_TYPES)
    .eq("status", "processed")
    .not("extracted_markdown", "is", null);

  if (error || !docs?.length) return [];

  const byCarrier = new Map<string, {
    carrier_name: string;
    documents: string[];
    filenames: string[];
    effective_date: string | null;
    snippets: string[];
  }>();

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

    const existing = byCarrier.get(doc.carrier_id);
    if (existing) {
      existing.documents.push(doc.id as string);
      existing.filenames.push(doc.filename as string);
      if (!existing.effective_date && doc.effective_date) {
        existing.effective_date = doc.effective_date as string;
      }
      const budget = 10 - existing.snippets.length;
      if (budget > 0) existing.snippets.push(...snippets.slice(0, budget));
    } else {
      byCarrier.set(doc.carrier_id, {
        carrier_name: carrierName,
        documents: [doc.id as string],
        filenames: [doc.filename as string],
        effective_date: (doc.effective_date as string) ?? null,
        snippets,
      });
    }
  }

  const hits: MarkdownHit[] = [];
  for (const [carrierId, entry] of byCarrier) {
    hits.push({
      carrier_id: carrierId,
      carrier_name: entry.carrier_name,
      document_id: entry.documents[0],
      filename: entry.filenames.join(", "),
      effective_date: entry.effective_date,
      snippets: entry.snippets,
    });
  }

  return hits;
}
