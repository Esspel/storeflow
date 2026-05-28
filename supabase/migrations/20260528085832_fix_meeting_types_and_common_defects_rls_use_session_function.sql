/*
  # Fix RLS policies for meeting_types and common_defects

  The previous migration used auth.uid() which only works with Supabase Auth.
  This app uses a custom session token system via app_current_user_id().

  ## Changes
  - Drop and recreate all RLS policies on meeting_types to use app_current_user_id()
  - Drop and recreate all RLS policies on common_defects to use app_current_user_id()
  - Add checkpoint_id column to common_defects for linking to kundrunda checkpoints

  ## New column
  - common_defects.checkpoint_ids: text[] — array of kundrunda_checkpoints.id values
*/

-- ── meeting_types: drop old policies and recreate with app_current_user_id() ──

DROP POLICY IF EXISTS "meeting_types_select" ON meeting_types;
DROP POLICY IF EXISTS "meeting_types_insert" ON meeting_types;
DROP POLICY IF EXISTS "meeting_types_update" ON meeting_types;
DROP POLICY IF EXISTS "meeting_types_delete" ON meeting_types;

CREATE POLICY "meeting_types_select"
  ON meeting_types FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "meeting_types_insert"
  ON meeting_types FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE id = app_current_user_id()
        AND role IN ('admin', 'manager')
        AND is_active = true
    )
  );

CREATE POLICY "meeting_types_update"
  ON meeting_types FOR UPDATE
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE id = app_current_user_id()
        AND role IN ('admin', 'manager')
        AND is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE id = app_current_user_id()
        AND role IN ('admin', 'manager')
        AND is_active = true
    )
  );

CREATE POLICY "meeting_types_delete"
  ON meeting_types FOR DELETE
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE id = app_current_user_id()
        AND role = 'admin'
        AND is_active = true
    )
  );

-- ── common_defects: drop old policies and recreate with app_current_user_id() ──

DROP POLICY IF EXISTS "common_defects_select" ON common_defects;
DROP POLICY IF EXISTS "common_defects_insert" ON common_defects;
DROP POLICY IF EXISTS "common_defects_update" ON common_defects;
DROP POLICY IF EXISTS "common_defects_delete" ON common_defects;

CREATE POLICY "common_defects_select"
  ON common_defects FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "common_defects_insert"
  ON common_defects FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE id = app_current_user_id()
        AND role IN ('admin', 'manager')
        AND is_active = true
    )
  );

CREATE POLICY "common_defects_update"
  ON common_defects FOR UPDATE
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE id = app_current_user_id()
        AND role IN ('admin', 'manager')
        AND is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE id = app_current_user_id()
        AND role IN ('admin', 'manager')
        AND is_active = true
    )
  );

CREATE POLICY "common_defects_delete"
  ON common_defects FOR DELETE
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE id = app_current_user_id()
        AND role IN ('admin', 'manager')
        AND is_active = true
    )
  );

-- ── Add checkpoint_ids array column to common_defects ──

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'common_defects' AND column_name = 'checkpoint_ids'
  ) THEN
    ALTER TABLE common_defects ADD COLUMN checkpoint_ids text[] NOT NULL DEFAULT '{}';
  END IF;
END $$;
