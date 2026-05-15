/*
  # Fix RLS policies for schedule import flow

  ## Problems fixed
  1. schedule_imports INSERT policy only checked au.store_id — fails when admin/manager
     is assigned to store via user_stores (not legacy store_id column)
  2. employee_mappings INSERT/UPDATE/DELETE had same store_id mismatch issue
  3. user_stores INSERT/UPDATE only allowed 'admin' — managers need to insert store links
     when creating users during import
  4. app_users INSERT only allowed 'admin' — managers need to create users during import

  ## Changes
  - schedule_imports: broaden INSERT to check user_stores membership too
  - employee_mappings: broaden all policies to check user_stores membership too
  - user_stores: allow managers to insert/update/delete
  - app_users: allow managers to insert
*/

-- ── schedule_imports: fix INSERT policy ────────────────────────────────────────
DROP POLICY IF EXISTS "Valid session can insert schedule imports" ON schedule_imports;
CREATE POLICY "Valid session can insert schedule imports"
  ON schedule_imports FOR INSERT
  TO anon
  WITH CHECK (
    app_current_user_id() IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM app_users au
        WHERE au.id = app_current_user_id()
          AND au.store_id = schedule_imports.store_id
      )
      OR EXISTS (
        SELECT 1 FROM user_stores us
        WHERE us.user_id = app_current_user_id()
          AND us.store_id = schedule_imports.store_id
      )
    )
  );

-- ── employee_mappings: fix INSERT policy ───────────────────────────────────────
DROP POLICY IF EXISTS "Valid session can insert employee mappings" ON employee_mappings;
CREATE POLICY "Valid session can insert employee mappings"
  ON employee_mappings FOR INSERT
  TO anon
  WITH CHECK (
    app_current_user_id() IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM app_users au
        WHERE au.id = app_current_user_id()
          AND au.store_id = employee_mappings.store_id
      )
      OR EXISTS (
        SELECT 1 FROM user_stores us
        WHERE us.user_id = app_current_user_id()
          AND us.store_id = employee_mappings.store_id
      )
    )
  );

-- ── employee_mappings: fix UPDATE policy ───────────────────────────────────────
DROP POLICY IF EXISTS "Valid session can update employee mappings" ON employee_mappings;
CREATE POLICY "Valid session can update employee mappings"
  ON employee_mappings FOR UPDATE
  TO anon
  USING (
    app_current_user_id() IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM app_users au
        WHERE au.id = app_current_user_id()
          AND au.store_id = employee_mappings.store_id
      )
      OR EXISTS (
        SELECT 1 FROM user_stores us
        WHERE us.user_id = app_current_user_id()
          AND us.store_id = employee_mappings.store_id
      )
    )
  )
  WITH CHECK (
    app_current_user_id() IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM app_users au
        WHERE au.id = app_current_user_id()
          AND au.store_id = employee_mappings.store_id
      )
      OR EXISTS (
        SELECT 1 FROM user_stores us
        WHERE us.user_id = app_current_user_id()
          AND us.store_id = employee_mappings.store_id
      )
    )
  );

-- ── employee_mappings: fix DELETE policy ───────────────────────────────────────
DROP POLICY IF EXISTS "Valid session can delete employee mappings" ON employee_mappings;
CREATE POLICY "Valid session can delete employee mappings"
  ON employee_mappings FOR DELETE
  TO anon
  USING (
    app_current_user_id() IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM app_users au
        WHERE au.id = app_current_user_id()
          AND au.store_id = employee_mappings.store_id
      )
      OR EXISTS (
        SELECT 1 FROM user_stores us
        WHERE us.user_id = app_current_user_id()
          AND us.store_id = employee_mappings.store_id
      )
    )
  );

-- ── employee_mappings: fix SELECT policy ───────────────────────────────────────
DROP POLICY IF EXISTS "Valid session can view employee mappings" ON employee_mappings;
CREATE POLICY "Valid session can view employee mappings"
  ON employee_mappings FOR SELECT
  TO anon
  USING (
    app_current_user_id() IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM app_users au
        WHERE au.id = app_current_user_id()
          AND au.store_id = employee_mappings.store_id
      )
      OR EXISTS (
        SELECT 1 FROM user_stores us
        WHERE us.user_id = app_current_user_id()
          AND us.store_id = employee_mappings.store_id
      )
    )
  );

-- ── user_stores: allow managers to insert/update/delete ────────────────────────
DROP POLICY IF EXISTS "Admins can insert user_stores" ON user_stores;
CREATE POLICY "Admins and managers can insert user_stores"
  ON user_stores FOR INSERT
  TO anon
  WITH CHECK (
    app_current_user_role() = 'admin'
    OR app_current_user_role() = 'manager'
  );

DROP POLICY IF EXISTS "Admins can update user_stores" ON user_stores;
CREATE POLICY "Admins and managers can update user_stores"
  ON user_stores FOR UPDATE
  TO anon
  USING (
    app_current_user_role() = 'admin'
    OR app_current_user_role() = 'manager'
  )
  WITH CHECK (
    app_current_user_role() = 'admin'
    OR app_current_user_role() = 'manager'
  );

DROP POLICY IF EXISTS "Admins can delete user_stores" ON user_stores;
CREATE POLICY "Admins and managers can delete user_stores"
  ON user_stores FOR DELETE
  TO anon
  USING (
    app_current_user_role() = 'admin'
    OR app_current_user_role() = 'manager'
  );

-- ── app_users: allow managers to insert (create users during import) ───────────
DROP POLICY IF EXISTS "Admins can insert app_users" ON app_users;
CREATE POLICY "Admins and managers can insert app_users"
  ON app_users FOR INSERT
  TO anon
  WITH CHECK (
    app_current_user_role() = 'admin'
    OR app_current_user_role() = 'manager'
  );
