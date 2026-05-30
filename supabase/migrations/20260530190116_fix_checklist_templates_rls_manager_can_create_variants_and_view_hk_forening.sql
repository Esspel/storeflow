/*
  # Fix checklist_templates RLS so managers and forening users can create local variants

  ## Problem
  1. SELECT policy only covers is_global=true templates — HK templates with is_global=false
     and forening templates are invisible to managers after load(), so the freshly inserted
     variant can't be fetched and openEdit() is never called.

  2. INSERT policy "Admins and managers can create templates" uses app_current_user_role()
     which returns the role column. Forening-level users whose role is 'manager' pass, but
     hierarchy_level='hk' or 'forening' users with role='manager' may have been blocked by
     the WITH CHECK on hierarchy_scope='forening' policy when creating a store-scope variant.

  ## Changes
  - Drop the narrow SELECT policy and replace it with one that covers:
      • is_global = true  (existing)
      • hierarchy_scope = 'hk'  (all authenticated users)
      • hierarchy_scope = 'forening' where forening_id matches user's forening or store's forening
      • hierarchy_scope = 'store' where template_stores has a matching user store
  - Extend the INSERT policy to also allow managers (any role='manager') to insert
    store-scope templates (hierarchy_scope='store') regardless of hierarchy_level.
*/

-- Drop the old narrow SELECT policy
DROP POLICY IF EXISTS "Users can view templates for their store or global" ON checklist_templates;

-- New comprehensive SELECT policy
CREATE POLICY "Users can view relevant templates"
  ON checklist_templates FOR SELECT
  TO authenticated
  USING (
    app_current_user_id() IS NOT NULL AND (
      -- Admins see everything
      app_current_user_role() = 'admin'
      -- All authenticated users see HK-scope templates (is_global or hierarchy_scope='hk')
      OR is_global = true
      OR hierarchy_scope = 'hk'
      -- Forening templates: visible to the right forening users and stores in that forening
      OR (
        hierarchy_scope = 'forening'
        AND forening_id IS NOT NULL
        AND (
          EXISTS (
            SELECT 1 FROM app_users u
            WHERE u.id = app_current_user_id()
            AND (
              u.forening_id = checklist_templates.forening_id
              OR u.hierarchy_level = 'forening'
            )
          )
          OR EXISTS (
            SELECT 1 FROM stores s
            JOIN app_users u ON u.id = app_current_user_id()
            WHERE s.forening_id = checklist_templates.forening_id
            AND s.id = ANY(app_user_store_ids())
          )
        )
      )
      -- Store-scope templates: visible when template is assigned to user's store
      OR EXISTS (
        SELECT 1 FROM template_stores ts
        WHERE ts.template_id = checklist_templates.id
        AND ts.store_id = ANY(app_user_store_ids())
      )
      -- Store-scope templates created by this user (e.g. orphaned / just created)
      OR (
        hierarchy_scope = 'store'
        AND created_by = app_current_user_id()
      )
    )
  );

-- Ensure managers (including those with hierarchy_level hk/forening) can insert store-scope variants
DROP POLICY IF EXISTS "Admins and managers can create templates" ON checklist_templates;

CREATE POLICY "Admins and managers can create templates"
  ON checklist_templates FOR INSERT
  TO authenticated
  WITH CHECK (
    app_current_user_id() IS NOT NULL
    AND (
      app_current_user_role() = 'admin'
      OR (
        app_current_user_role() = 'manager'
        AND hierarchy_scope = 'store'
        AND is_global = false
      )
    )
  );

-- Keep the forening insert policy as-is (covers forening-scope templates)
-- It already handles forening users creating forening templates
