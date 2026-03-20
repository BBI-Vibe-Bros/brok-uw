import { createAdminRouteClient, createServiceClient } from "@/lib/supabase/server";

const DEFAULT_RETENTION_DAYS = 90;

/**
 * Stamp a conversation with a PHI expiry date.
 * Called when a conversation is created or updated with health data.
 */
export async function setPhiExpiry(
  conversationId: string,
  retentionDays = DEFAULT_RETENTION_DAYS
) {
  const svc = await createAdminRouteClient();
  const expiresAt = new Date(
    Date.now() + retentionDays * 24 * 60 * 60 * 1000
  ).toISOString();

  await svc
    .from("conversations")
    .update({ phi_expires_at: expiresAt })
    .eq("id", conversationId);
}

/**
 * Invoke the DB function that purges expired conversations + messages.
 * Intended to be called by a cron job or edge function.
 */
export async function purgeExpiredPhi(): Promise<number> {
  const svc = createServiceClient();
  const { data, error } = await svc.rpc("purge_expired_phi");
  if (error) {
    console.error("purge_expired_phi failed:", error.message);
    return 0;
  }
  return (data as number) ?? 0;
}

/**
 * Scrub PHI from a string for logging purposes.
 * Strips patterns that look like SSNs, DOBs, phone numbers, and names
 * commonly found in insurance contexts.
 */
export function scrubPhi(text: string): string {
  return text
    .replace(/\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/g, "[SSN]")
    .replace(/\b(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/\d{4}\b/g, "[DOB]")
    .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, "[PHONE]");
}
