/*
  # Förening-mall support and HK-mall hiding

  ## Summary
  This migration adds first-class support for "Förenings-mallar" — templates managed
  by users with hierarchy_level = 'forening'. These work identically to HK-mallar
  (global templates owned by admin/HK) but are scoped to a specific förening.

  ## New Tables
  - `forening_hidden_templates`: Tracks which HK-mallar (global templates) a förening
    has chosen to hide for all stores within their förening.

  ## Changes to checklist_templates
  - `hierarchy_scope` already exists ('store' | 'hk' | 'forening') — repurposed for this
  - Adds a new value 'forening' to the existing text column (no enum, just convention)
  - `forening_id`: already exists (uuid, nullable) — used to scope forening templates

  ## New RLS Policies on checklist_templates
  - Förening users can INSERT templates with hierarchy_scope='forening' and their own forening_id
  - Förening users can UPDATE/DELETE their own forening templates (created_by = them)
  - HK (hierarchy_level = 'hk') cannot edit forening-scoped templates
  - SELECT: förening templates visible to stores in same förening

  ## New Table: forening_hidden_templates
  - Stores which global (HK) template_ids a förening has hidden
  - RLS: förening users can manage their own entries; stores can read

  ## Notes
  - 'hk' templates remain: is_global=true, hierarchy_scope='hk', forening_id=NULL
  - 'forening' templates: is_global=false, hierarchy_scope='forening', forening_id=<uuid>
  - Visibility: forening templates visible to stores whose store.forening_id matches template.forening_id
*/

-- Forening hidden templates: which HK-mallar a förening hides for its stores
CREATE TABLE IF NOT EXISTS forening_hidden_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  forening_id uuid NOT NULL REFERENCES foreningar(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
  hidden_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(forening_id, template_id)
);

ALTER TABLE forening_hidden_templates ENABLE ROW LEVEL SECURITY;

-- Förening users can read hidden templates for their förening
CREATE POLICY "Forening members can read their hidden templates"
  ON forening_hidden_templates FOR SELECT
  TO anon
  USING (
    app_current_user_id() IS NOT NULL
    AND (
      app_current_user_role() = 'admin'
      OR EXISTS (
        SELECT 1 FROM app_users u
        WHERE u.id = app_current_user_id()
          AND u.hierarchy_level IN ('forening', 'hk', 'admin')
          AND u.forening_id = forening_hidden_templates.forening_id
      )
      OR EXISTS (
        SELECT 1 FROM app_users u
        JOIN stores s ON s.id = ANY(app_user_store_ids())
        WHERE u.id = app_current_user_id()
          AND s.forening_id = forening_hidden_templates.forening_id
        LIMIT 1
      )
    )
  );

-- Förening users can insert hidden templates for their own förening
CREATE POLICY "Forening users can hide HK templates for their forening"
  ON forening_hidden_templates FOR INSERT
  TO anon
  WITH CHECK (
    app_current_user_id() IS NOT NULL
    AND (
      app_current_user_role() = 'admin'
      OR EXISTS (
        SELECT 1 FROM app_users u
        WHERE u.id = app_current_user_id()
          AND u.hierarchy_level = 'forening'
          AND u.forening_id = forening_hidden_templates.forening_id
      )
    )
  );

-- Förening users can delete their own hidden template entries
CREATE POLICY "Forening users can unhide HK templates for their forening"
  ON forening_hidden_templates FOR DELETE
  TO anon
  USING (
    app_current_user_id() IS NOT NULL
    AND (
      app_current_user_role() = 'admin'
      OR EXISTS (
        SELECT 1 FROM app_users u
        WHERE u.id = app_current_user_id()
          AND u.hierarchy_level = 'forening'
          AND u.forening_id = forening_hidden_templates.forening_id
      )
    )
  );

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_forening_hidden_templates_forening ON forening_hidden_templates(forening_id);
CREATE INDEX IF NOT EXISTS idx_forening_hidden_templates_template ON forening_hidden_templates(template_id);
CREATE INDEX IF NOT EXISTS idx_checklist_templates_forening_scope ON checklist_templates(forening_id, hierarchy_scope);

-- New RLS policies for forening-scoped template writes
-- INSERT: förening users can create templates scoped to their förening
CREATE POLICY "Forening users can create forening templates"
  ON checklist_templates FOR INSERT
  TO anon
  WITH CHECK (
    app_current_user_id() IS NOT NULL
    AND hierarchy_scope = 'forening'
    AND EXISTS (
      SELECT 1 FROM app_users u
      WHERE u.id = app_current_user_id()
        AND (u.hierarchy_level = 'forening' OR u.role = 'admin')
        AND (u.role = 'admin' OR u.forening_id = checklist_templates.forening_id)
    )
  );

-- UPDATE: förening users can edit their own forening templates; admins can edit any
CREATE POLICY "Forening users can update own forening templates"
  ON checklist_templates FOR UPDATE
  TO anon
  USING (
    app_current_user_id() IS NOT NULL
    AND hierarchy_scope = 'forening'
    AND (
      app_current_user_role() = 'admin'
      OR (
        created_by = app_current_user_id()
        AND EXISTS (
          SELECT 1 FROM app_users u
          WHERE u.id = app_current_user_id()
            AND u.hierarchy_level = 'forening'
        )
      )
    )
  )
  WITH CHECK (
    app_current_user_id() IS NOT NULL
    AND hierarchy_scope = 'forening'
    AND (
      app_current_user_role() = 'admin'
      OR (
        created_by = app_current_user_id()
        AND EXISTS (
          SELECT 1 FROM app_users u
          WHERE u.id = app_current_user_id()
            AND u.hierarchy_level = 'forening'
        )
      )
    )
  );

-- DELETE: förening users can delete their own forening templates; admins can delete any
CREATE POLICY "Forening users can delete own forening templates"
  ON checklist_templates FOR DELETE
  TO anon
  USING (
    app_current_user_id() IS NOT NULL
    AND hierarchy_scope = 'forening'
    AND (
      app_current_user_role() = 'admin'
      OR (
        created_by = app_current_user_id()
        AND EXISTS (
          SELECT 1 FROM app_users u
          WHERE u.id = app_current_user_id()
            AND u.hierarchy_level = 'forening'
        )
      )
    )
  );
