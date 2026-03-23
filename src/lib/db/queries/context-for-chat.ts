import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Gather relevant DB context for general/conversational questions.
 * Returns a plain-text summary the AI can reference.
 */
export async function gatherChatContext(
  supabase: SupabaseClient,
  message: string
): Promise<string | null> {
  const m = message.toLowerCase();
  const parts: string[] = [];

  const wantsCarrierList =
    m.includes("carrier") ||
    m.includes("cover") ||
    m.includes("which") ||
    m.includes("who do you") ||
    m.includes("what companies");

  const wantsGuideInfo =
    m.includes("guide") ||
    m.includes("underwriting guide") ||
    m.includes("on file") ||
    m.includes("uploaded") ||
    m.includes("have guides") ||
    m.includes("have a guide");

  if (wantsCarrierList || wantsGuideInfo) {
    const { data: docs } = await supabase
      .from("source_documents")
      .select("carrier_id, filename, document_type, status, effective_date, carriers(name)")
      .eq("status", "processed")
      .order("uploaded_at", { ascending: false });

    if (docs?.length) {
      const carrierMap = new Map<string, { name: string; guides: string[]; apps: string[] }>();

      for (const doc of docs) {
        const carrierRaw = doc.carriers as { name: string } | { name: string }[] | null;
        const name = carrierRaw
          ? Array.isArray(carrierRaw)
            ? carrierRaw[0]?.name ?? "Unknown"
            : carrierRaw.name
          : "Unknown";

        if (!carrierMap.has(doc.carrier_id)) {
          carrierMap.set(doc.carrier_id, { name, guides: [], apps: [] });
        }
        const entry = carrierMap.get(doc.carrier_id)!;
        const label = doc.filename + (doc.effective_date ? ` (eff. ${doc.effective_date})` : "");
        if (doc.document_type === "uw_guide") {
          entry.guides.push(label);
        } else {
          entry.apps.push(label);
        }
      }

      const lines: string[] = [];
      for (const [, c] of carrierMap) {
        const items: string[] = [];
        if (c.guides.length) items.push(`UW guide: ${c.guides[0]}`);
        if (c.apps.length) items.push(`App: ${c.apps[0]}`);
        lines.push(`• ${c.name} — ${items.join("; ")}`);
      }

      parts.push(
        `Carriers with documents on file (${carrierMap.size} total):\n${lines.join("\n")}`
      );
    } else {
      parts.push("No carrier documents are on file yet.");
    }
  }

  // Check for specific carrier mentions and pull rule counts
  if (wantsGuideInfo) {
    const { data: ruleCounts } = await supabase
      .from("rules")
      .select("carrier_id, carriers(name)")
      .eq("status", "verified");

    if (ruleCounts?.length) {
      const countMap = new Map<string, { name: string; count: number }>();
      for (const r of ruleCounts) {
        const carrierRaw = r.carriers as { name: string } | { name: string }[] | null;
        const name = carrierRaw
          ? Array.isArray(carrierRaw)
            ? carrierRaw[0]?.name ?? "Unknown"
            : carrierRaw.name
          : "Unknown";
        const existing = countMap.get(r.carrier_id) ?? { name, count: 0 };
        existing.count++;
        countMap.set(r.carrier_id, existing);
      }

      const lines = [...countMap.values()].map(
        (c) => `• ${c.name}: ${c.count} verified rules`
      );
      parts.push(`Verified rules by carrier:\n${lines.join("\n")}`);
    }
  }

  return parts.length > 0 ? parts.join("\n\n") : null;
}
