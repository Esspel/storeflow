/*
  # Add Kundrunda Version Management

  Enables central vs local vs parallel version management for Kundrunda checkpoints.

  ## Overview
  - Admins manage a "central" definition of zones/checkpoints
  - Each store (Butikschef) can have a "local" customized copy
  - When admin publishes a new central version, each store is notified
  - The Butikschef can choose: (1) overwrite with central, (2) keep local, (3) run both in parallel

  ## New Tables

  ### `kundrunda_local_versions`
  Tracks per-store version metadata.
  - `id` (uuid, PK)
  - `store_id` (uuid, FK → stores)
  - `version_type` ('local' | 'central' | 'parallel') — which version is active
  - `central_version_id` (int) — which global version was last synced
  - `central_version_pending` (bool) — there is a new central version awaiting decision
  - `pending_central_version_id` (int, nullable) — the version ID that is pending
  - `parallel_choice` ('central' | 'local' | null) — if parallel, which to use this session

  ### `kundrunda_central_versions`
  Snapshot of zones/checkpoints when admin publishes a new version.
  - `id` (int, PK, serial)
  - `published_by` (uuid, FK → app_users)
  - `published_at` (timestamptz)
  - `label` (text) — human-readable version label e.g. "2026-Q2"
  - `snapshot` (jsonb) — full zones+checkpoints snapshot at publish time

  ## New Columns

  - `kundrunda_zones.is_local_override` (bool, default false) — marks a zone added by local store
  - `kundrunda_zones.store_id` (uuid, nullable) — NULL = central, non-null = store-local zone
  - `kundrunda_checkpoints.is_local_override` (bool, default false)
  - `kundrunda_checkpoints.store_id` (uuid, nullable) — NULL = central, non-null = store-local

  ## Security
  - RLS on all new tables
  - Local version records scoped to store members
  - Central versions readable by all authenticated users, writable by admin only
*/

-- Central versions table
CREATE TABLE IF NOT EXISTS kundrunda_central_versions (
  id serial PRIMARY KEY,
  published_by uuid REFERENCES app_users(id),
  published_at timestamptz DEFAULT now(),
  label text NOT NULL DEFAULT '',
  snapshot jsonb NOT NULL DEFAULT '[]'::jsonb
);

ALTER TABLE kundrunda_central_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read central versions"
  ON kundrunda_central_versions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert central versions"
  ON kundrunda_central_versions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Local versions tracking table
CREATE TABLE IF NOT EXISTS kundrunda_local_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  version_type text NOT NULL DEFAULT 'central' CHECK (version_type IN ('local', 'central', 'parallel')),
  central_version_id int REFERENCES kundrunda_central_versions(id),
  central_version_pending boolean NOT NULL DEFAULT false,
  pending_central_version_id int REFERENCES kundrunda_central_versions(id),
  parallel_choice text CHECK (parallel_choice IN ('central', 'local')),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (store_id)
);

ALTER TABLE kundrunda_local_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Store members can read their local version"
  ON kundrunda_local_versions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_stores
      WHERE user_stores.store_id = kundrunda_local_versions.store_id
        AND user_stores.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM app_users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Store managers can update their local version"
  ON kundrunda_local_versions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_stores
      JOIN app_users ON app_users.id = user_stores.user_id
      WHERE user_stores.store_id = kundrunda_local_versions.store_id
        AND user_stores.user_id = auth.uid()
        AND app_users.role IN ('manager', 'admin')
    )
    OR EXISTS (
      SELECT 1 FROM app_users
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_stores
      JOIN app_users ON app_users.id = user_stores.user_id
      WHERE user_stores.store_id = kundrunda_local_versions.store_id
        AND user_stores.user_id = auth.uid()
        AND app_users.role IN ('manager', 'admin')
    )
    OR EXISTS (
      SELECT 1 FROM app_users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can insert local version records"
  ON kundrunda_local_versions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Add store_id column to zones (NULL = central/shared, non-null = store-local)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'kundrunda_zones' AND column_name = 'store_id'
  ) THEN
    ALTER TABLE kundrunda_zones ADD COLUMN store_id uuid REFERENCES stores(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'kundrunda_zones' AND column_name = 'is_local_override'
  ) THEN
    ALTER TABLE kundrunda_zones ADD COLUMN is_local_override boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- Add store_id column to checkpoints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'kundrunda_checkpoints' AND column_name = 'store_id'
  ) THEN
    ALTER TABLE kundrunda_checkpoints ADD COLUMN store_id uuid REFERENCES stores(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'kundrunda_checkpoints' AND column_name = 'is_local_override'
  ) THEN
    ALTER TABLE kundrunda_checkpoints ADD COLUMN is_local_override boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- Update zones RLS to allow store-local zones (managers can manage their store's zones)
-- (Central zones: store_id IS NULL — only admin can modify)
-- (Local zones: store_id IS NOT NULL — store managers can manage)

DROP POLICY IF EXISTS "Managers can insert zones" ON kundrunda_zones;
DROP POLICY IF EXISTS "Managers can update zones" ON kundrunda_zones;
DROP POLICY IF EXISTS "Managers can delete zones" ON kundrunda_zones;

CREATE POLICY "Managers can insert local zones for their store"
  ON kundrunda_zones FOR INSERT
  TO authenticated
  WITH CHECK (
    store_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_stores
      JOIN app_users ON app_users.id = user_stores.user_id
      WHERE user_stores.store_id = kundrunda_zones.store_id
        AND user_stores.user_id = auth.uid()
        AND app_users.role IN ('manager', 'admin')
    )
    OR (store_id IS NULL AND EXISTS (
      SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin'
    ))
  );

CREATE POLICY "Managers can update local zones for their store"
  ON kundrunda_zones FOR UPDATE
  TO authenticated
  USING (
    (store_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_stores
      JOIN app_users ON app_users.id = user_stores.user_id
      WHERE user_stores.store_id = kundrunda_zones.store_id
        AND user_stores.user_id = auth.uid()
        AND app_users.role IN ('manager', 'admin')
    ))
    OR (store_id IS NULL AND EXISTS (
      SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin'
    ))
  )
  WITH CHECK (
    (store_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_stores
      JOIN app_users ON app_users.id = user_stores.user_id
      WHERE user_stores.store_id = kundrunda_zones.store_id
        AND user_stores.user_id = auth.uid()
        AND app_users.role IN ('manager', 'admin')
    ))
    OR (store_id IS NULL AND EXISTS (
      SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin'
    ))
  );

CREATE POLICY "Managers can delete local zones for their store"
  ON kundrunda_zones FOR DELETE
  TO authenticated
  USING (
    (store_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_stores
      JOIN app_users ON app_users.id = user_stores.user_id
      WHERE user_stores.store_id = kundrunda_zones.store_id
        AND user_stores.user_id = auth.uid()
        AND app_users.role IN ('manager', 'admin')
    ))
    OR (store_id IS NULL AND EXISTS (
      SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin'
    ))
  );

-- Update checkpoints RLS similarly
DROP POLICY IF EXISTS "Managers can insert checkpoints" ON kundrunda_checkpoints;
DROP POLICY IF EXISTS "Managers can update checkpoints" ON kundrunda_checkpoints;
DROP POLICY IF EXISTS "Managers can delete checkpoints" ON kundrunda_checkpoints;

CREATE POLICY "Managers can insert local checkpoints for their store"
  ON kundrunda_checkpoints FOR INSERT
  TO authenticated
  WITH CHECK (
    store_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_stores
      JOIN app_users ON app_users.id = user_stores.user_id
      WHERE user_stores.store_id = kundrunda_checkpoints.store_id
        AND user_stores.user_id = auth.uid()
        AND app_users.role IN ('manager', 'admin')
    )
    OR (store_id IS NULL AND EXISTS (
      SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin'
    ))
  );

CREATE POLICY "Managers can update local checkpoints for their store"
  ON kundrunda_checkpoints FOR UPDATE
  TO authenticated
  USING (
    (store_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_stores
      JOIN app_users ON app_users.id = user_stores.user_id
      WHERE user_stores.store_id = kundrunda_checkpoints.store_id
        AND user_stores.user_id = auth.uid()
        AND app_users.role IN ('manager', 'admin')
    ))
    OR (store_id IS NULL AND EXISTS (
      SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin'
    ))
  )
  WITH CHECK (
    (store_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_stores
      JOIN app_users ON app_users.id = user_stores.user_id
      WHERE user_stores.store_id = kundrunda_checkpoints.store_id
        AND user_stores.user_id = auth.uid()
        AND app_users.role IN ('manager', 'admin')
    ))
    OR (store_id IS NULL AND EXISTS (
      SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin'
    ))
  );

CREATE POLICY "Managers can delete local checkpoints for their store"
  ON kundrunda_checkpoints FOR DELETE
  TO authenticated
  USING (
    (store_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_stores
      JOIN app_users ON app_users.id = user_stores.user_id
      WHERE user_stores.store_id = kundrunda_checkpoints.store_id
        AND user_stores.user_id = auth.uid()
        AND app_users.role IN ('manager', 'admin')
    ))
    OR (store_id IS NULL AND EXISTS (
      SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin'
    ))
  );
