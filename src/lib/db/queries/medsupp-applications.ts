import type { SupabaseClient } from "@supabase/supabase-js";
import { DOCUMENT_TYPE_MEDSUPP_APPLICATION } from "@/lib/documents/document-types";

export interface MedsuppApplicationRow {
  id: string;
  carrier_id: string;
  filename: string;
  storage_path: string;
  uploaded_at: string;
  version: number;
}

/**
 * Latest Med Supp application for a carrier that admins have activated for agents
 * (`status` = processed).
 */
export async function getLatestMedsuppApplicationForCarrier(
  supabase: SupabaseClient,
  carrierId: string
): Promise<MedsuppApplicationRow | null> {
  const { data, error } = await supabase
    .from("source_documents")
    .select("id, carrier_id, filename, storage_path, uploaded_at, version")
    .eq("carrier_id", carrierId)
    .eq("document_type", DOCUMENT_TYPE_MEDSUPP_APPLICATION)
    .eq("status", "processed")
    .order("uploaded_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as MedsuppApplicationRow;
}
