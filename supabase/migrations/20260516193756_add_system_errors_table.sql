/*
  # Add system_errors table for client telemetry

  ## Purpose
  Captures anonymised JavaScript errors from React Error Boundaries and
  repeated API failures (after withRetry exhaustion) so Coop Helpdesk can
  diagnose device-specific issues without requiring physical access.

  ## New Tables
  - system_errors
    - id (uuid, PK)
    - error_message (text) — exception .message
    - component_stack (text, nullable) — React componentStack from ErrorInfo
    - store_id (uuid, nullable, FK → stores) — active store at time of error
    - user_agent (text, nullable) — navigator.userAgent
    - route (text, nullable) — window.location.pathname
    - extra (jsonb, nullable) — additional context (e.g. failed URL)
    - created_at (timestamptz)

  ## Security
  - RLS enabled
  - INSERT open to anon (clients must be able to report errors even if not
    fully authenticated; store_id is nullable for pre-login crashes)
  - SELECT restricted to admin role only (via app_current_user_role)
*/

CREATE TABLE IF NOT EXISTS system_errors (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  error_message text        NOT NULL,
  component_stack text      NULL,
  store_id      uuid        NULL REFERENCES stores(id) ON DELETE SET NULL,
  user_agent    text        NULL,
  route         text        NULL,
  extra         jsonb       NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE system_errors ENABLE ROW LEVEL SECURITY;

-- Anyone (including unauthenticated users) can INSERT error reports
CREATE POLICY "Anyone can insert system_errors"
  ON system_errors FOR INSERT
  TO anon
  WITH CHECK (true);

-- Only admins can read error reports
CREATE POLICY "Admins can read system_errors"
  ON system_errors FOR SELECT
  TO anon
  USING (app_current_user_role() = 'admin');

-- Index for time-based queries from the diagnostics screen
CREATE INDEX IF NOT EXISTS idx_system_errors_created_at
  ON system_errors (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_errors_store_id
  ON system_errors (store_id)
  WHERE store_id IS NOT NULL;
