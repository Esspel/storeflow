/*
  # Local Common Defects and Merge Tracking

  ## Summary
  Extends the kundrunda system so that "vanliga avvikelser" (common defects) support
  the same local/HK version hierarchy as kundrunda zones and checkpoints.

  ## Changes

  ### kundrunda_common_defects
  - Adds `store_id` (nullable uuid): NULL = global/HK defect, non-NULL = store-local copy
  - Adds `hk_defect_id` (nullable uuid): points to the global defect this was cloned from
  - Adds `is_local_override` (boolean): true when this is a store-specific version
  - Adds `pending_hk_update` (boolean): true when HK published a new version the store hasn't merged

  ### kundrunda_local_versions
  - Adds `defects_pending_hk_update` (boolean): mirrors pending state for the defects list separately
  - Adds `pending_defects_snapshot` (jsonb): stores the HK defects snapshot awaiting merge decision

  ## Notes
  - Global defects (store_id IS NULL) remain accessible to all stores as before
  - When a store has local defects, those are shown instead of global ones
  - merge = copy HK defects into store's local defects, replacing matching hk_defect_id entries
  - All existing data remains intact; new columns default to safe values
*/

-- Add local/HK versioning columns to common defects
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'kundrunda_common_defects' AND column_name = 'store_id'
  ) THEN
    ALTER TABLE kundrunda_common_defects ADD COLUMN store_id uuid REFERENCES stores(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'kundrunda_common_defects' AND column_name = 'hk_defect_id'
  ) THEN
    ALTER TABLE kundrunda_common_defects ADD COLUMN hk_defect_id uuid REFERENCES kundrunda_common_defects(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'kundrunda_common_defects' AND column_name = 'is_local_override'
  ) THEN
    ALTER TABLE kundrunda_common_defects ADD COLUMN is_local_override boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'kundrunda_common_defects' AND column_name = 'pending_hk_update'
  ) THEN
    ALTER TABLE kundrunda_common_defects ADD COLUMN pending_hk_update boolean DEFAULT false;
  END IF;
END $$;

-- Add defects merge tracking to kundrunda_local_versions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'kundrunda_local_versions' AND column_name = 'defects_pending_hk_update'
  ) THEN
    ALTER TABLE kundrunda_local_versions ADD COLUMN defects_pending_hk_update boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'kundrunda_local_versions' AND column_name = 'pending_defects_snapshot'
  ) THEN
    ALTER TABLE kundrunda_local_versions ADD COLUMN pending_defects_snapshot jsonb;
  END IF;
END $$;

-- Indexes for local defect lookups
CREATE INDEX IF NOT EXISTS idx_kundrunda_common_defects_store ON kundrunda_common_defects(store_id);
CREATE INDEX IF NOT EXISTS idx_kundrunda_common_defects_hk_id ON kundrunda_common_defects(hk_defect_id);

-- Update RLS: local defects (store_id IS NOT NULL) writable by store managers
-- Global defects (store_id IS NULL) writable by admin/HK

-- Drop old broad insert/update/delete policies and replace with scoped ones
DROP POLICY IF EXISTS "Managers can insert common defects" ON kundrunda_common_defects;
DROP POLICY IF EXISTS "Managers can update common defects" ON kundrunda_common_defects;
DROP POLICY IF EXISTS "Managers can delete common defects" ON kundrunda_common_defects;

-- Global defects: only admin can write
CREATE POLICY "Admins can insert global common defects"
  ON kundrunda_common_defects FOR INSERT
  TO anon
  WITH CHECK (
    app_current_user_id() IS NOT NULL
    AND (
      (store_id IS NULL AND app_current_user_role() = 'admin')
      OR
      (store_id IS NOT NULL AND store_id = app_current_store_id() AND app_current_user_role() IN ('admin', 'manager'))
    )
  );

CREATE POLICY "Admins and store managers can update common defects"
  ON kundrunda_common_defects FOR UPDATE
  TO anon
  USING (
    app_current_user_id() IS NOT NULL
    AND (
      (store_id IS NULL AND app_current_user_role() = 'admin')
      OR
      (store_id IS NOT NULL AND store_id = app_current_store_id() AND app_current_user_role() IN ('admin', 'manager'))
    )
  )
  WITH CHECK (
    app_current_user_id() IS NOT NULL
    AND (
      (store_id IS NULL AND app_current_user_role() = 'admin')
      OR
      (store_id IS NOT NULL AND store_id = app_current_store_id() AND app_current_user_role() IN ('admin', 'manager'))
    )
  );

CREATE POLICY "Admins and store managers can delete common defects"
  ON kundrunda_common_defects FOR DELETE
  TO anon
  USING (
    app_current_user_id() IS NOT NULL
    AND (
      (store_id IS NULL AND app_current_user_role() = 'admin')
      OR
      (store_id IS NOT NULL AND store_id = app_current_store_id() AND app_current_user_role() IN ('admin', 'manager'))
    )
  );
