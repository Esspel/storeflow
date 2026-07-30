-- ============================================================================
-- MIGRATION: Secure app_users SELECT Policies & Create Safe Public Lookup View
-- DESCRIPTION: Drops open SELECT policies that exposed password_hash and
--              quick_pin_hash. Implements strict row-level access for users/managers
--              and provides a safe SECURITY DEFINER view for unauthenticated lookups.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Droppa befintliga vidöppna SELECT-policyer på app_users
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view all app_users" ON app_users;
DROP POLICY IF EXISTS "Public read for login lookup" ON app_users;

-- ----------------------------------------------------------------------------
-- 2. Skapa strikta SELECT-policyer för app_users
-- ----------------------------------------------------------------------------

-- A) Alla autentiserade användare kan läsa sin egen rad
CREATE POLICY "Users can view own app_user record"
  ON app_users FOR SELECT
  TO anon, authenticated
  USING (id = app_current_user_id());

-- B) Admins och Managers kan läsa användare kopplade till sina tilldelade butiker
CREATE POLICY "Managers and Admins can view store app_users"
  ON app_users FOR SELECT
  TO anon, authenticated
  USING (
    app_current_user_role() = 'admin'
    OR (
      app_current_user_role() = 'manager'
      AND EXISTS (
        SELECT 1 FROM user_stores us
        WHERE us.user_id = app_users.id
          AND us.store_id = ANY(app_user_store_ids())
      )
    )
  );

-- ----------------------------------------------------------------------------
-- 3. Skapa en säker vy för inloggning/uppslag (exkluderar känsliga hash-fält)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW app_users_public_lookup AS
SELECT
  id,
  username,
  display_name,
  role,
  hierarchy_level,
  active_store_id,
  is_active,
  created_at,
  updated_at
FROM app_users
WHERE is_active = true;

-- Ge läsrättigheter till anon och authenticated för den säkra vyn
GRANT SELECT ON app_users_public_lookup TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. Säkerhetskommentar och verifiering
-- ----------------------------------------------------------------------------
COMMENT ON VIEW app_users_public_lookup IS 
  'Säker vy för användaruppslag vid inloggning/profiler utan exponering av password_hash, quick_pin_hash eller barcode_id.';

COMMIT;
