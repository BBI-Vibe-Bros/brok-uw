import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DOCUMENT_TYPE_MEDSUPP_APPLICATION,
  DOWNLOADABLE_DOC_TYPES,
  type AdminDocumentType,
} from "@/lib/documents/document-types";

export interface DownloadableDocRow {
  id: string;
  carrier_id: string;
  filename: string;
  storage_path: string;
  uploaded_at: string;
  version: number;
  document_type: AdminDocumentType;
}

export type MedsuppApplicationRow = DownloadableDocRow;

/**
 * Latest Med Supp application for a carrier that admins have activated for agents
 * (`status` = processed).
 */
export async function getLatestMedsuppApplicationForCarrier(
  supabase: SupabaseClient,
  carrierId: string
): Promise<MedsuppApplicationRow | null> {
  return getLatestDownloadableDoc(supabase, carrierId, DOCUMENT_TYPE_MEDSUPP_APPLICATION);
}

/**
 * Latest downloadable document of a specific type for a carrier.
 */
export async function getLatestDownloadableDoc(
  supabase: SupabaseClient,
  carrierId: string,
  docType: AdminDocumentType
): Promise<DownloadableDocRow | null> {
  const { data, error } = await supabase
    .from("source_documents")
    .select("id, carrier_id, filename, storage_path, uploaded_at, version, document_type")
    .eq("carrier_id", carrierId)
    .eq("document_type", docType)
    .eq("status", "processed")
    .order("uploaded_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as DownloadableDocRow;
}

/**
 * Search all downloadable document types for a given carrier.
 * Returns the latest of each type that's been published.
 */
export async function getAllDownloadableDocsForCarrier(
  supabase: SupabaseClient,
  carrierId: string
): Promise<DownloadableDocRow[]> {
  const { data, error } = await supabase
    .from("source_documents")
    .select("id, carrier_id, filename, storage_path, uploaded_at, version, document_type")
    .eq("carrier_id", carrierId)
    .in("document_type", DOWNLOADABLE_DOC_TYPES)
    .eq("status", "processed")
    .order("uploaded_at", { ascending: false });

  if (error || !data) return [];

  const seen = new Set<string>();
  const result: DownloadableDocRow[] = [];
  for (const row of data) {
    const dt = row.document_type as string;
    if (!seen.has(dt)) {
      seen.add(dt);
      result.push(row as DownloadableDocRow);
    }
  }
  return result;
}
