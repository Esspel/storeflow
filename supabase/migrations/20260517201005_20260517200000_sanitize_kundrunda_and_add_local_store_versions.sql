/*
  # Sanitize Kundrunda & Local Store Version Support

  ## Changes

  ### 1. Add store_id ownership to zones/checkpoints
  - NULL store_id = global/central (admin-managed)
  - Non-NULL store_id = store-local copy (chef-managed)

  ### 2. RLS policies for zone/checkpoint CRUD
  - Admins: manage global (store_id IS NULL) zones/checkpoints
  - Managers: manage store-local (store_id = their store) zones/checkpoints

  ### 3. Sanitize checkpoint descriptions
  - Remove all tool/system-specific names (Shoppa, Upshop, RDM, Danfoss, Tomra, etc.)
  - Replace with system-agnostic operational language

  ## Security
  - All policies use app_current_user_role() and app_current_store_id()
*/

-- Add store_id to kundrunda_zones if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'kundrunda_zones' AND column_name = 'store_id'
  ) THEN
    ALTER TABLE kundrunda_zones ADD COLUMN store_id uuid REFERENCES stores(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add store_id to kundrunda_checkpoints if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'kundrunda_checkpoints' AND column_name = 'store_id'
  ) THEN
    ALTER TABLE kundrunda_checkpoints ADD COLUMN store_id uuid REFERENCES stores(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add is_local_override to kundrunda_zones if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'kundrunda_zones' AND column_name = 'is_local_override'
  ) THEN
    ALTER TABLE kundrunda_zones ADD COLUMN is_local_override boolean DEFAULT false;
  END IF;
END $$;

-- Add is_local_override to kundrunda_checkpoints if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'kundrunda_checkpoints' AND column_name = 'is_local_override'
  ) THEN
    ALTER TABLE kundrunda_checkpoints ADD COLUMN is_local_override boolean DEFAULT false;
  END IF;
END $$;

-- INSERT policy for zones
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'kundrunda_zones' AND policyname = 'Managers can insert zones in their scope'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "Managers can insert zones in their scope"
        ON kundrunda_zones FOR INSERT
        TO anon
        WITH CHECK (
          app_current_user_role() IN ('admin', 'manager')
          AND (
            (store_id IS NULL AND app_current_user_role() = 'admin')
            OR (store_id = app_current_store_id() AND app_current_user_role() IN ('admin', 'manager'))
          )
        )
    $pol$;
  END IF;
END $$;

-- UPDATE policy for zones
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'kundrunda_zones' AND policyname = 'Managers can update zones in their scope'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "Managers can update zones in their scope"
        ON kundrunda_zones FOR UPDATE
        TO anon
        USING (
          (store_id IS NULL AND app_current_user_role() = 'admin')
          OR (store_id = app_current_store_id() AND app_current_user_role() IN ('admin', 'manager'))
        )
        WITH CHECK (
          (store_id IS NULL AND app_current_user_role() = 'admin')
          OR (store_id = app_current_store_id() AND app_current_user_role() IN ('admin', 'manager'))
        )
    $pol$;
  END IF;
END $$;

-- DELETE policy for zones
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'kundrunda_zones' AND policyname = 'Managers can delete zones in their scope'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "Managers can delete zones in their scope"
        ON kundrunda_zones FOR DELETE
        TO anon
        USING (
          (store_id IS NULL AND app_current_user_role() = 'admin')
          OR (store_id = app_current_store_id() AND app_current_user_role() IN ('admin', 'manager'))
        )
    $pol$;
  END IF;
END $$;

-- INSERT policy for checkpoints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'kundrunda_checkpoints' AND policyname = 'Managers can insert checkpoints in their scope'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "Managers can insert checkpoints in their scope"
        ON kundrunda_checkpoints FOR INSERT
        TO anon
        WITH CHECK (
          app_current_user_role() IN ('admin', 'manager')
          AND (
            (store_id IS NULL AND app_current_user_role() = 'admin')
            OR (store_id = app_current_store_id() AND app_current_user_role() IN ('admin', 'manager'))
          )
        )
    $pol$;
  END IF;
END $$;

-- UPDATE policy for checkpoints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'kundrunda_checkpoints' AND policyname = 'Managers can update checkpoints in their scope'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "Managers can update checkpoints in their scope"
        ON kundrunda_checkpoints FOR UPDATE
        TO anon
        USING (
          (store_id IS NULL AND app_current_user_role() = 'admin')
          OR (store_id = app_current_store_id() AND app_current_user_role() IN ('admin', 'manager'))
        )
        WITH CHECK (
          (store_id IS NULL AND app_current_user_role() = 'admin')
          OR (store_id = app_current_store_id() AND app_current_user_role() IN ('admin', 'manager'))
        )
    $pol$;
  END IF;
END $$;

-- DELETE policy for checkpoints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'kundrunda_checkpoints' AND policyname = 'Managers can delete checkpoints in their scope'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "Managers can delete checkpoints in their scope"
        ON kundrunda_checkpoints FOR DELETE
        TO anon
        USING (
          (store_id IS NULL AND app_current_user_role() = 'admin')
          OR (store_id = app_current_store_id() AND app_current_user_role() IN ('admin', 'manager'))
        )
    $pol$;
  END IF;
END $$;

-- Sanitize checkpoint descriptions: replace tool-specific references with agnostic text
UPDATE kundrunda_checkpoints
SET description = TRIM(REGEXP_REPLACE(
  REGEXP_REPLACE(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          REGEXP_REPLACE(
            REGEXP_REPLACE(
              REGEXP_REPLACE(
                REGEXP_REPLACE(
                  REGEXP_REPLACE(
                    COALESCE(description, ''),
                    'via\s+(Shoppa|GK\s+Engage)[^.]*\.?', '', 'gi'),
                  '\s*[\(\[](Shoppa|GK\s+Engage|Upshop|Zebra\s+TC[0-9]+|Open\s+Access|RDM|Danfoss|Tomra|SoftOne\s+GO|Scan\s+&\s+Pay|Coop-appen|SAP\s+FnR|Store\s+Office)[^\)\]]*[\)\]]', '', 'gi'),
                'Shoppa[^,\.;]*[,\.;]?', '', 'gi'),
              'GK\s+Engage[^,\.;]*[,\.;]?', '', 'gi'),
            'Upshop[^,\.;]*[,\.;]?', '', 'gi'),
          'Zebra\s+TC[0-9]+[^,\.;]*[,\.;]?', '', 'gi'),
        'Open\s+Access[^,\.;]*[,\.;]?', '', 'gi'),
      'RDM\/Danfoss[^,\.;]*[,\.;]?', '', 'gi'),
    'Tomra[^,\.;]*[,\.;]?', '', 'gi'),
  '\s{2,}', ' ', 'g'))
WHERE description IS NOT NULL
  AND (
    description ILIKE '%shoppa%'
    OR description ILIKE '%gk engage%'
    OR description ILIKE '%upshop%'
    OR description ILIKE '%zebra%'
    OR description ILIKE '%open access%'
    OR description ILIKE '%rdm%'
    OR description ILIKE '%danfoss%'
    OR description ILIKE '%tomra%'
  );

-- Set empty descriptions to NULL
UPDATE kundrunda_checkpoints
SET description = NULL
WHERE TRIM(COALESCE(description, '')) = '';
