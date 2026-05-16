
/*
  # Login Attempts & Account Lockout

  ## Summary
  Adds brute-force protection to the authentication system. Tracks consecutive
  failed login attempts per username and locks accounts temporarily after 5 failures.

  ## New Table
  - `login_attempts`
    - `id` (uuid, primary key)
    - `username` (text) — the username attempted
    - `ip_address` (text, nullable) — caller IP for audit
    - `success` (boolean) — whether this attempt succeeded
    - `attempted_at` (timestamptz) — when it happened

  ## Changes to app_users
  - `failed_login_count` (int, default 0) — consecutive failed attempts
  - `locked_until` (timestamptz, nullable) — when lockout expires (NULL = not locked)

  ## New Functions
  - `record_failed_login(p_username text)` — increments counter, sets lockout after 5 failures
  - `record_successful_login(p_username text)` — resets counter and clears lockout
  - `check_account_locked(p_username text)` — returns locked_until or NULL

  ## Security
  - RLS enabled on login_attempts (anon can insert, service role reads)
  - Functions are SECURITY DEFINER to allow anon role to call them safely
*/

-- login_attempts audit table
CREATE TABLE IF NOT EXISTS login_attempts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username     text NOT NULL,
  ip_address   text,
  success      boolean NOT NULL DEFAULT false,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

-- Anon can insert (needed for Edge Function calling with anon key)
CREATE POLICY "Anon can insert login attempts"
  ON login_attempts FOR INSERT
  TO anon
  WITH CHECK (true);

-- Only authenticated sessions can read (admin auditing)
CREATE POLICY "Admins can read login attempts"
  ON login_attempts FOR SELECT
  TO anon
  USING (app_current_user_role() = 'admin');

-- Add lockout columns to app_users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'app_users' AND column_name = 'failed_login_count'
  ) THEN
    ALTER TABLE app_users ADD COLUMN failed_login_count int NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'app_users' AND column_name = 'locked_until'
  ) THEN
    ALTER TABLE app_users ADD COLUMN locked_until timestamptz;
  END IF;
END $$;

-- Index for fast lockout lookups
CREATE INDEX IF NOT EXISTS idx_app_users_locked_until ON app_users (locked_until) WHERE locked_until IS NOT NULL;

-- Record a failed login: increment counter, lock after 5 failures
CREATE OR REPLACE FUNCTION public.record_failed_login(p_username text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  UPDATE app_users
  SET
    failed_login_count = failed_login_count + 1,
    locked_until = CASE
      WHEN failed_login_count + 1 >= 5
      THEN now() + INTERVAL '15 minutes'
      ELSE locked_until
    END
  WHERE username = p_username
  RETURNING failed_login_count INTO v_count;

  INSERT INTO login_attempts (username, success) VALUES (p_username, false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_failed_login(text) TO anon, authenticated;

-- Record a successful login: reset counter and clear lockout
CREATE OR REPLACE FUNCTION public.record_successful_login(p_username text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE app_users
  SET
    failed_login_count = 0,
    locked_until = NULL
  WHERE username = p_username;

  INSERT INTO login_attempts (username, success) VALUES (p_username, true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_successful_login(text) TO anon, authenticated;

-- Check if account is currently locked — returns locked_until or NULL
CREATE OR REPLACE FUNCTION public.check_account_locked(p_username text)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_locked_until timestamptz;
BEGIN
  SELECT locked_until INTO v_locked_until
  FROM app_users
  WHERE username = p_username AND is_active = true;

  IF v_locked_until IS NOT NULL AND v_locked_until > now() THEN
    RETURN v_locked_until;
  END IF;

  -- Auto-clear expired lockout
  IF v_locked_until IS NOT NULL AND v_locked_until <= now() THEN
    UPDATE app_users SET locked_until = NULL, failed_login_count = 0 WHERE username = p_username;
  END IF;

  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_account_locked(text) TO anon, authenticated;
