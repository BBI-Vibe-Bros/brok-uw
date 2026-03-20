import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_BUCKET = "uw-documents";

export async function createSignedDownloadUrl(
  supabase: SupabaseClient,
  storagePath: string,
  expiresSeconds = 3600
): Promise<string | null> {
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || DEFAULT_BUCKET;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(storagePath, expiresSeconds);
  if (error || !data?.signedUrl) {
    console.error("createSignedDownloadUrl", error?.message);
    return null;
  }
  return data.signedUrl;
}
