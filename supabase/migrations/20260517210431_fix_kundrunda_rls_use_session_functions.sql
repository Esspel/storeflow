/*
  # Fix kundrunda RLS policies to use session auth functions

  ## Problem
  Several RLS policies on kundrunda tables use `auth.uid()` (Supabase JWT auth)
  instead of `app_current_user_id()` / `app_current_user_role()` (custom session auth).
  Since this app uses custom session-based auth, `auth.uid()` always returns NULL,
  causing inserts and updates to fail silently.

  ## Tables fixed
  - `kundrunda_central_versions`: INSERT policy
  - `kundrunda_local_versions`: duplicate/broken INSERT policies
  - `kundrunda_zones`: duplicate policies using auth.uid()
  - `kundrunda_checkpoints`: duplicate policies using auth.uid()

  ## Changes
  - Drop all policies that use auth.uid() on these tables
  - Keep / add correct policies using app_current_user_id() and app_current_user_role()
*/

-- ── kundrunda_central_versions ────────────────────────────────────────────────

DROP POLICY IF EXISTS "Admins can insert central versions" ON kundrunda_central_versions;

CREATE POLICY "Admins can insert central versions"
  ON kundrunda_central_versions FOR INSERT
  TO anon
  WITH CHECK (app_current_user_role() = 'admin');

-- ── kundrunda_local_versions ──────────────────────────────────────────────────

-- Drop old auth.uid()-based INSERT policies
DROP POLICY IF EXISTS "Admins can insert local version records" ON kundrunda_local_versions;

-- Drop duplicate policies that may conflict
DROP POLICY IF EXISTS "Managers and admins can insert local versions" ON kundrunda_local_versions;
DROP POLICY IF EXISTS "Managers and admins can update local versions" ON kundrunda_local_versions;
DROP POLICY IF EXISTS "Store managers can update their local version" ON kundrunda_local_versions;
DROP POLICY IF EXISTS "Store members can read their local version" ON kundrunda_local_versions;

-- Keep the working session-based policies (already exist):
--   "Managers can insert local versions"
--   "Managers can update local versions"
--   "Users can read local versions for their stores"
--   "Users can view local versions for their store"
--   "Admins can delete local versions"

-- ── kundrunda_zones ───────────────────────────────────────────────────────────

-- Drop duplicate auth.uid()-based policies
DROP POLICY IF EXISTS "Managers can insert local zones for their store" ON kundrunda_zones;
DROP POLICY IF EXISTS "Managers can update local zones for their store" ON kundrunda_zones;
DROP POLICY IF EXISTS "Managers can delete local zones for their store" ON kundrunda_zones;

-- Keep the working session-based policies:
--   "Managers can insert zones in their scope"
--   "Managers can update zones in their scope"
--   "Managers can delete zones in their scope"
--   "Valid session can read zones"

-- ── kundrunda_checkpoints ─────────────────────────────────────────────────────

-- Drop duplicate auth.uid()-based policies
DROP POLICY IF EXISTS "Managers can insert local checkpoints for their store" ON kundrunda_checkpoints;
DROP POLICY IF EXISTS "Managers can update local checkpoints for their store" ON kundrunda_checkpoints;
DROP POLICY IF EXISTS "Managers can delete local checkpoints for their store" ON kundrunda_checkpoints;

-- Keep the working session-based policies:
--   "Managers can insert checkpoints in their scope"
--   "Managers can update checkpoints in their scope"
--   "Managers can delete checkpoints in their scope"
--   "Valid session can read checkpoints"
