-- Phase 4: Privacy + Audit Logging
-- Run this in the Supabase SQL editor

-- 1. PHI retention: add expiry column to conversations
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS phi_expires_at timestamptz;

-- Default: 90 days from creation
-- Cron or edge function calls purge_expired_phi() periodically
CREATE OR REPLACE FUNCTION purge_expired_phi()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  purged integer;
BEGIN
  WITH expired AS (
    SELECT id FROM conversations
    WHERE phi_expires_at IS NOT NULL
      AND phi_expires_at < now()
  ),
  del_msgs AS (
    DELETE FROM messages
    WHERE conversation_id IN (SELECT id FROM expired)
  )
  DELETE FROM conversations WHERE id IN (SELECT id FROM expired);
  GET DIAGNOSTICS purged = ROW_COUNT;
  RETURN purged;
END;
$$;

-- 2. Audit log table
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  resource_type text,
  resource_id text,
  metadata jsonb DEFAULT '{}',
  ip_address inet,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);

-- RLS: only admins can read audit logs, service role can insert
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit logs"
  ON audit_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Service role can insert audit logs"
  ON audit_logs FOR INSERT
  WITH CHECK (true);
