import type { SupabaseClient } from "@supabase/supabase-js";

export interface CarrierRow {
  id: string;
  name: string;
  slug: string;
}

function normalize(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Resolve a carrier from free text (user message or LLM "mention").
 * Returns null if no reasonable match; multiple strong matches returns best-scoring.
 */
export async function resolveCarrierMention(
  supabase: SupabaseClient,
  mention: string | null,
  fallbackHaystack?: string
): Promise<CarrierRow | null> {
  const { data: carriers, error } = await supabase.from("carriers").select("id, name, slug").order("name");
  if (error || !carriers?.length) return null;

  const hay = normalize([mention, fallbackHaystack].filter(Boolean).join(" "));
  if (!hay) return null;

  let best: { row: CarrierRow; score: number } | null = null;

  for (const c of carriers as CarrierRow[]) {
    const nameN = normalize(c.name);
    const slugN = normalize(c.slug.replace(/-/g, " "));
    let score = 0;
    if (hay === nameN || hay === slugN) score = 100;
    else if (nameN && hay.includes(nameN)) score = Math.max(score, 80);
    else if (nameN && nameN.includes(hay) && hay.length >= 3) score = Math.max(score, 70);
    else if (slugN && hay.includes(slugN)) score = Math.max(score, 75);
    else {
      const parts = hay.split(/\s+/).filter((p) => p.length >= 3);
      for (const p of parts) {
        if (nameN.includes(p) || slugN.includes(p)) score = Math.max(score, 50);
      }
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { row: c, score };
    }
  }

  if (!best || best.score < 50) return null;
  return best.row;
}
