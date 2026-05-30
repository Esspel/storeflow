/*
  # Fix checklist_templates RLS — replace TO authenticated policies with TO anon

  ## Problem
  The previous migration created SELECT and INSERT policies with `TO authenticated`.
  This app uses a custom session system (x-session-token header) and connects via the
  Supabase anon key, so all requests arrive as the `anon` role — `TO authenticated`
  policies never apply, breaking both reads and writes.

  ## Changes
  - Drop the two broken policies that used TO authenticated
  - Recreate them targeting anon/public (no role restriction) matching all other policies
  - The SELECT policy restores visibility of hk/forening/store templates correctly
  - The INSERT policy allows admins to create any scope, managers to create store-scope only
*/

-- Drop the broken policies from the previous migration
DROP POLICY IF EXISTS "Users can view relevant templates" ON checklist_templates;
DROP POLICY IF EXISTS "Admins and managers can create templates" ON checklist_templates;

-- Restore correct SELECT policy (no role restriction — anon role like all other policies)
CREATE POLICY "Users can view relevant templates"
  ON checklist_templates FOR SELECT
  USING (
    app_current_user_id() IS NOT NULL AND (
      app_current_user_role() = 'admin'
      OR is_global = true
      OR hierarchy_scope = 'hk'
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
      OR EXISTS (
        SELECT 1 FROM template_stores ts
        WHERE ts.template_id = checklist_templates.id
        AND ts.store_id = ANY(app_user_store_ids())
      )
      OR (
        hierarchy_scope = 'store'
        AND created_by = app_current_user_id()
      )
    )
  );

-- Restore correct INSERT policy (no role restriction — anon role like all other policies)
-- Admins can insert any scope; managers can only insert store-scope non-global templates
CREATE POLICY "Admins and managers can create templates"
  ON checklist_templates FOR INSERT
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
