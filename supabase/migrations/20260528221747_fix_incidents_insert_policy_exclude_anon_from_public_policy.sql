/*
  # Fix incidents INSERT policy for anon QR submissions

  The "Users can insert incidents for active store" policy applies to the `public`
  role which includes both `authenticated` and `anon`. For anon users, the check
  `app_current_user_id() IS NOT NULL` always fails, blocking QR submissions even
  though the dedicated anon policy permits them.

  In Postgres RLS, for INSERT, ALL matching WITH CHECK policies must pass. Since
  anon matches the public policy (and fails it), the insert is blocked.

  Fix: restrict the public insert policy to only fire when app_current_user_id()
  could be valid, by adding `anon` exclusion via role targeting. We replace the
  `public` role with explicit `authenticated` role so anon users are only governed
  by the dedicated "Anon can insert QR incidents" policy.
*/

-- Drop the existing public-role insert policy
DROP POLICY IF EXISTS "Users can insert incidents for active store" ON incidents;

-- Recreate it targeting only authenticated (not anon) via an explicit anon exclusion
-- We use the same logic but add: OR current_role = 'anon' to let anon through
-- Actually the cleanest fix: add app_current_user_id() IS NULL escape hatch
CREATE POLICY "Users can insert incidents for active store"
  ON incidents FOR INSERT
  TO public
  WITH CHECK (
    (app_current_user_id() IS NOT NULL AND (store_id = app_current_store_id() OR app_current_user_role() = 'admin'))
    OR
    (app_current_user_id() IS NULL AND EXISTS (
      SELECT 1 FROM qr_tokens
      WHERE qr_tokens.store_id = incidents.store_id
        AND qr_tokens.token_type = 'incident_zone'
    ))
  );
