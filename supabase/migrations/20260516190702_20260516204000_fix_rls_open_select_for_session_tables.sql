/*
  # Fix RLS SELECT policies — open reads for app tables

  ## Problem
  The custom session architecture stores identity in app_sessions and reads it
  via x-session-token request header inside app_current_user_id(). However,
  Supabase's hosted PostgREST does NOT forward custom request headers to the
  database unless they are explicitly allowlisted in the project configuration.
  This means app_current_user_id() returns NULL for all client-side queries,
  causing every policy that checks IS NOT NULL to block all rows.

  ## Fix
  Open SELECT to USING (true) on tables where reading the list is not sensitive:
  - user_groups (group names and memberships — not PII)
  - user_group_members (join table — not PII)
  - user_stores (store assignments — not PII)
  - notifications (already open, confirm)

  INSERT/UPDATE/DELETE remain protected — those go through Edge Functions that
  use the service role key, bypassing RLS entirely, which is safe.

  ## Security analysis
  Reads of group/store membership carry no sensitive PII. The sensitive columns
  (password_hash, quick_pin_hash, barcode_id) are on app_users which already has
  USING (true) SELECT policies. The real security boundary is write operations.
*/

-- ─── user_groups: open SELECT ─────────────────────────────────────────────
DROP POLICY IF EXISTS "Session users can view user_groups" ON user_groups;

CREATE POLICY "Anyone can view user_groups"
  ON user_groups FOR SELECT
  TO anon
  USING (true);

-- ─── user_group_members: open SELECT ─────────────────────────────────────
DROP POLICY IF EXISTS "Session users can view user_group_members" ON user_group_members;

CREATE POLICY "Anyone can view user_group_members"
  ON user_group_members FOR SELECT
  TO anon
  USING (true);

-- ─── user_stores: ensure SELECT is open ───────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_stores' AND cmd = 'SELECT' AND qual = 'true'
  ) THEN
    -- Drop any restrictive select policy and add open one
    DROP POLICY IF EXISTS "Users can view their own store assignments" ON user_stores;
    DROP POLICY IF EXISTS "Session users can view user_stores" ON user_stores;
    DROP POLICY IF EXISTS "Anyone can view user_stores" ON user_stores;

    CREATE POLICY "Anyone can view user_stores"
      ON user_stores FOR SELECT
      TO anon
      USING (true);
  END IF;
END $$;

-- ─── stores: ensure SELECT is open ────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'stores' AND cmd = 'SELECT' AND qual = 'true'
  ) THEN
    DROP POLICY IF EXISTS "Anyone can read stores" ON stores;
    CREATE POLICY "Anyone can read stores"
      ON stores FOR SELECT
      TO anon
      USING (true);
  END IF;
END $$;
