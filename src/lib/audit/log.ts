import type { createServiceClient } from "@/lib/supabase/server";

type AuditAction =
  | "query"
  | "login"
  | "signup"
  | "admin.upload"
  | "admin.publish_application"
  | "admin.approve_rule"
  | "admin.reject_rule"
  | "admin.extraction";

/**
 * Fire-and-forget audit log entry.
 * Uses the service client so RLS INSERT policy passes.
 */
export async function logAudit(
  svc: ReturnType<typeof createServiceClient>,
  userId: string | null,
  action: AuditAction,
  resourceType?: string | null,
  resourceId?: string | null,
  metadata?: Record<string, unknown> | null,
  ipAddress?: string | null
) {
  try {
    await svc.from("audit_logs").insert({
      user_id: userId,
      action,
      resource_type: resourceType ?? null,
      resource_id: resourceId ?? null,
      metadata: metadata ?? {},
      ip_address: ipAddress ?? null,
    });
  } catch (e) {
    console.error("audit log failed:", e);
  }
}
