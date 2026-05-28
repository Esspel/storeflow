/*
  # Fix multiple issues

  1. Add `source` column to `customer_requests`
     - Allows tracking whether a request came from QR code or staff
     - Default 'staff', QR submissions use 'qr'

  2. Add `upshop_url` column to `stores`
     - Stores the Upshop styrtavla iframe URL per store
     - Used to show the Upshop dashboard in Pulstavla

  3. Fix `qr_tokens` DELETE policy
     - Previous policy used `roles: authenticated` which doesn't match our custom session (anon role)
     - Replace with policy that allows deletion when app_current_user_id() matches created_by
     - Also allow managers/admins to delete any token for their store

  4. Fix `incidents` INSERT policy for anon (QR submissions)
     - The existing anon policy only checks that ANY incident_zone token exists for the store
     - This is correct — just ensure it's not conflicting with the general INSERT policy
*/

-- 1. Add source column to customer_requests
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customer_requests' AND column_name = 'source'
  ) THEN
    ALTER TABLE customer_requests ADD COLUMN source text DEFAULT 'staff';
  END IF;
END $$;

-- 2. Add upshop_url column to stores
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stores' AND column_name = 'upshop_url'
  ) THEN
    ALTER TABLE stores ADD COLUMN upshop_url text;
  END IF;
END $$;

-- 3. Fix qr_tokens DELETE policy
-- Drop the old authenticated-only delete policy
DROP POLICY IF EXISTS "Authenticated users can delete their own QR tokens" ON qr_tokens;

-- New policy: allow deletion if app_current_user_id() matches created_by OR user is admin/manager for that store
CREATE POLICY "Users can delete their own QR tokens"
  ON qr_tokens FOR DELETE
  TO anon, authenticated
  USING (
    created_by = app_current_user_id()
    OR EXISTS (
      SELECT 1 FROM app_users
      WHERE app_users.id = app_current_user_id()
        AND app_users.role IN ('admin', 'manager')
        AND app_users.is_active = true
        AND (
          app_users.role = 'admin'
          OR EXISTS (
            SELECT 1 FROM user_stores
            WHERE user_stores.store_id = qr_tokens.store_id
              AND user_stores.user_id = app_current_user_id()
          )
        )
    )
  );
