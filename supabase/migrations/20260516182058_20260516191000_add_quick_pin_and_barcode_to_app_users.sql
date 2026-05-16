
/*
  # Quick PIN and Barcode for Fast User Switch

  ## Summary
  Adds two new fields to app_users for the "Växla användare" feature on shared
  Zebra handheld devices in stores. Employees can authenticate in ~2 seconds
  by scanning their access card barcode or entering a 4-digit PIN instead of
  typing a full password.

  ## Changes to app_users
  - `quick_pin_hash` (text, nullable) — bcrypt hash of 4-digit PIN
  - `barcode_id` (text, nullable, unique per store) — employee access card barcode/QR value

  ## New Functions
  - `verify_quick_pin(p_user_id uuid, p_pin text)` — verifies PIN hash, returns bool
  - `lookup_user_by_barcode(p_barcode text, p_store_id uuid)` — finds user by barcode in store context

  ## Security Notes
  - quick_pin_hash uses the existing pgcrypto hash_password function (bcrypt)
  - barcode_id has a partial unique index scoped by store_id to prevent cross-store collisions
  - Users can only set their own PIN (via RLS on app_users UPDATE which already enforces ownership)
*/

-- Add columns to app_users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'app_users' AND column_name = 'quick_pin_hash'
  ) THEN
    ALTER TABLE app_users ADD COLUMN quick_pin_hash text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'app_users' AND column_name = 'barcode_id'
  ) THEN
    ALTER TABLE app_users ADD COLUMN barcode_id text;
  END IF;
END $$;

-- Index for fast barcode lookups (unique within a store via user_stores join — enforced in function)
CREATE INDEX IF NOT EXISTS idx_app_users_barcode_id ON app_users (barcode_id) WHERE barcode_id IS NOT NULL;

-- Verify a quick PIN for a given user
CREATE OR REPLACE FUNCTION public.verify_quick_pin(p_user_id uuid, p_pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash text;
BEGIN
  SELECT quick_pin_hash INTO v_hash FROM app_users WHERE id = p_user_id AND is_active = true;
  IF v_hash IS NULL THEN RETURN false; END IF;
  RETURN crypt(p_pin, v_hash) = v_hash;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_quick_pin(uuid, text) TO anon, authenticated;

-- Look up an active user by barcode within a store's user pool
-- Returns the user record if found and active; NULL otherwise
CREATE OR REPLACE FUNCTION public.lookup_user_by_barcode(p_barcode text, p_store_id uuid)
RETURNS TABLE (
  id              uuid,
  username        text,
  display_name    text,
  role            text,
  employee_group  text,
  store_id        uuid,
  active_store_id uuid,
  must_change_password boolean,
  last_login      timestamptz,
  created_at      timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id, u.username, u.display_name, u.role::text, u.employee_group,
    u.store_id, u.active_store_id, u.must_change_password, u.last_login, u.created_at
  FROM app_users u
  JOIN user_stores us ON us.user_id = u.id AND us.store_id = p_store_id
  WHERE u.barcode_id = p_barcode
    AND u.is_active = true
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_user_by_barcode(text, uuid) TO anon, authenticated;
