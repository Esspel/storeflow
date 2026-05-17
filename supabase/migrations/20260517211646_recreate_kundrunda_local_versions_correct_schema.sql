/*
  # Recreate kundrunda_local_versions with correct schema

  ## Problem
  The `kundrunda_local_versions` table was originally created as a per-checkpoint
  override table (with columns: title, zone_id, source_checkpoint_id, etc.).
  Later migrations attempted to recreate it as a per-store version tracker
  (with columns: version_type, central_version_pending, etc.) but used
  CREATE TABLE IF NOT EXISTS, so the original wrong schema persisted.

  The table is currently empty (0 rows) so it is safe to drop and recreate.

  ## New schema
  One row per store, tracks which version the store is on and whether a
  central version update is pending.
*/

-- Drop all dependent policies first
DROP POLICY IF EXISTS "Users can read local versions for their stores" ON kundrunda_local_versions;
DROP POLICY IF EXISTS "Users can view local versions for their store" ON kundrunda_local_versions;
DROP POLICY IF EXISTS "Managers can insert local versions" ON kundrunda_local_versions;
DROP POLICY IF EXISTS "Managers can update local versions" ON kundrunda_local_versions;
DROP POLICY IF EXISTS "Admins can delete local versions" ON kundrunda_local_versions;
DROP POLICY IF EXISTS "Managers and admins can insert local versions" ON kundrunda_local_versions;
DROP POLICY IF EXISTS "Managers and admins can update local versions" ON kundrunda_local_versions;
DROP POLICY IF EXISTS "Store managers can update their local version" ON kundrunda_local_versions;
DROP POLICY IF EXISTS "Store members can read their local version" ON kundrunda_local_versions;
DROP POLICY IF EXISTS "Admins can insert local version records" ON kundrunda_local_versions;

-- Drop the table (it is empty — verified by query returning 0 rows)
DROP TABLE IF EXISTS kundrunda_local_versions;

-- Recreate with correct per-store schema
CREATE TABLE kundrunda_local_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  version_type text NOT NULL DEFAULT 'local' CHECK (version_type IN ('local', 'central', 'parallel')),
  central_version_id int REFERENCES kundrunda_central_versions(id),
  central_version_pending boolean NOT NULL DEFAULT false,
  pending_central_version_id int REFERENCES kundrunda_central_versions(id),
  parallel_choice text CHECK (parallel_choice IN ('central', 'local')),
  defects_pending_hk_update boolean NOT NULL DEFAULT false,
  pending_defects_snapshot jsonb,
  updated_at timestamptz DEFAULT now(),
  UNIQUE (store_id)
);

ALTER TABLE kundrunda_local_versions ENABLE ROW LEVEL SECURITY;

-- SELECT: store members and admins
CREATE POLICY "Users can read local versions for their stores"
  ON kundrunda_local_versions FOR SELECT
  TO anon
  USING (
    (EXISTS (
      SELECT 1 FROM user_stores us
      WHERE us.user_id = app_current_user_id()
        AND us.store_id = kundrunda_local_versions.store_id
    ))
    OR app_current_user_role() = 'admin'
  );

-- INSERT: managers for their own store, admins for any
CREATE POLICY "Managers can insert local versions"
  ON kundrunda_local_versions FOR INSERT
  TO anon
  WITH CHECK (
    (
      store_id IN (
        SELECT user_stores.store_id FROM user_stores
        WHERE user_stores.user_id = app_current_user_id()
      )
    )
    OR (
      EXISTS (
        SELECT 1 FROM app_users
        WHERE app_users.id = app_current_user_id()
          AND app_users.role = 'admin'
      )
    )
  );

-- UPDATE: managers for their store, admins for any
CREATE POLICY "Managers can update local versions"
  ON kundrunda_local_versions FOR UPDATE
  TO anon
  USING (
    (
      store_id IN (
        SELECT user_stores.store_id FROM user_stores
        WHERE user_stores.user_id = app_current_user_id()
      )
    )
    OR (
      EXISTS (
        SELECT 1 FROM app_users
        WHERE app_users.id = app_current_user_id()
          AND app_users.role = 'admin'
      )
    )
  )
  WITH CHECK (
    (
      store_id IN (
        SELECT user_stores.store_id FROM user_stores
        WHERE user_stores.user_id = app_current_user_id()
      )
    )
    OR (
      EXISTS (
        SELECT 1 FROM app_users
        WHERE app_users.id = app_current_user_id()
          AND app_users.role = 'admin'
      )
    )
  );

-- DELETE: admins only
CREATE POLICY "Admins can delete local versions"
  ON kundrunda_local_versions FOR DELETE
  TO anon
  USING (app_current_user_role() = 'admin');
