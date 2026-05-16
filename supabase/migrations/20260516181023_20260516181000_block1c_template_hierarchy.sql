
/*
  # Block 1c: Template Hierarchy — is_global and locked_by_admin flags

  ## Summary
  Adds two boolean flags to `checklist_templates` to support a global template hierarchy
  where admins can broadcast templates to all stores and lock them against editing.

  ## Changes to checklist_templates
  - `is_global` (boolean, default false) — when true, template is visible to all stores
    regardless of template_stores assignments
  - `locked_by_admin` (boolean, default false) — when true, only admins can edit or delete

  ## RLS Policy Changes
  - SELECT: managers/employees can now also see global templates (is_global = true)
  - UPDATE: managers blocked from editing locked_by_admin templates
  - DELETE: managers blocked from deleting locked_by_admin or is_global templates
  - Duplicate/redundant policies removed

  ## Security Notes
  - Admins retain full access regardless of flags
  - Managers retain edit/delete rights only on templates they own AND that are not locked
*/

-- Add columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'checklist_templates' AND column_name = 'is_global'
  ) THEN
    ALTER TABLE checklist_templates ADD COLUMN is_global boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'checklist_templates' AND column_name = 'locked_by_admin'
  ) THEN
    ALTER TABLE checklist_templates ADD COLUMN locked_by_admin boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- Clean up duplicate/overlapping policies
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can read templates" ON checklist_templates;
DROP POLICY IF EXISTS "Templates visible to assigned users" ON checklist_templates;
DROP POLICY IF EXISTS "Managers can create templates" ON checklist_templates;
DROP POLICY IF EXISTS "Managers can insert templates" ON checklist_templates;
DROP POLICY IF EXISTS "Managers can update own templates" ON checklist_templates;
DROP POLICY IF EXISTS "Managers can update templates" ON checklist_templates;
DROP POLICY IF EXISTS "Managers can delete own templates" ON checklist_templates;
DROP POLICY IF EXISTS "Managers can delete templates" ON checklist_templates;

-- ─────────────────────────────────────────────────────────────
-- SELECT: global templates OR store-assigned templates
-- ─────────────────────────────────────────────────────────────
CREATE POLICY "Users can view templates for their store or global"
  ON checklist_templates FOR SELECT
  USING (
    app_current_user_id() IS NOT NULL
    AND (
      is_global = true
      OR app_current_user_role() = 'admin'
      OR EXISTS (
        SELECT 1 FROM template_stores ts
        WHERE ts.template_id = checklist_templates.id
          AND ts.store_id = ANY(app_user_store_ids())
      )
    )
  );

-- ─────────────────────────────────────────────────────────────
-- INSERT: admins and managers
-- ─────────────────────────────────────────────────────────────
CREATE POLICY "Admins and managers can create templates"
  ON checklist_templates FOR INSERT
  WITH CHECK (
    app_current_user_id() IS NOT NULL
    AND app_current_user_role() = ANY(ARRAY['admin', 'manager'])
  );

-- ─────────────────────────────────────────────────────────────
-- UPDATE: admins always; managers only if not locked and owner
-- ─────────────────────────────────────────────────────────────
CREATE POLICY "Admins can update any template"
  ON checklist_templates FOR UPDATE
  USING (app_current_user_role() = 'admin')
  WITH CHECK (app_current_user_role() = 'admin');

CREATE POLICY "Managers can update own unlocked templates"
  ON checklist_templates FOR UPDATE
  USING (
    app_current_user_role() = 'manager'
    AND created_by = app_current_user_id()
    AND locked_by_admin = false
    AND is_global = false
  )
  WITH CHECK (
    app_current_user_role() = 'manager'
    AND created_by = app_current_user_id()
    AND locked_by_admin = false
    AND is_global = false
  );

-- ─────────────────────────────────────────────────────────────
-- DELETE: admins always; managers only if not locked/global and owner
-- ─────────────────────────────────────────────────────────────
CREATE POLICY "Admins can delete any template"
  ON checklist_templates FOR DELETE
  USING (app_current_user_role() = 'admin');

CREATE POLICY "Managers can delete own unlocked non-global templates"
  ON checklist_templates FOR DELETE
  USING (
    app_current_user_role() = 'manager'
    AND created_by = app_current_user_id()
    AND locked_by_admin = false
    AND is_global = false
  );
