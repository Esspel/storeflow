/*
  # Fix link_lists RLS - allow forening and HK users to create lists

  The previous INSERT policy only allowed 'admin' and 'manager' roles.
  This blocked forening (hierarchy_level='forening') and HK (hierarchy_level='hk')
  users from creating their respective scoped lists.

  Changes:
  - Drop and recreate INSERT policy for link_lists to also check hierarchy_level
  - Drop and recreate INSERT policy for link_list_items similarly
  - Also fix SELECT policy to show hk-lists to all and respect the active store properly
*/

-- Drop existing insert policies
DROP POLICY IF EXISTS "Managers can create link lists" ON link_lists;
DROP POLICY IF EXISTS "Managers can insert link items" ON link_list_items;

-- INSERT: admin/manager/forening/hk users can create lists within their scope
CREATE POLICY "Managers and forening users can create link lists"
  ON link_lists FOR INSERT
  TO anon
  WITH CHECK (
    (SELECT role FROM app_users WHERE id = app_current_user_id() LIMIT 1) = 'admin'
    OR (SELECT hierarchy_level FROM app_users WHERE id = app_current_user_id() LIMIT 1) IN ('hk', 'forening')
    OR (SELECT role FROM app_users WHERE id = app_current_user_id() LIMIT 1) = 'manager'
  );

-- UPDATE: also allow forening/hk users to update their own lists
DROP POLICY IF EXISTS "Creators can update their link lists" ON link_lists;
CREATE POLICY "Creators can update their link lists"
  ON link_lists FOR UPDATE
  TO anon
  USING (
    created_by = app_current_user_id()
    OR (SELECT role FROM app_users WHERE id = app_current_user_id() LIMIT 1) = 'admin'
    OR (SELECT hierarchy_level FROM app_users WHERE id = app_current_user_id() LIMIT 1) IN ('hk', 'forening')
    OR (SELECT role FROM app_users WHERE id = app_current_user_id() LIMIT 1) = 'manager'
  )
  WITH CHECK (
    created_by = app_current_user_id()
    OR (SELECT role FROM app_users WHERE id = app_current_user_id() LIMIT 1) = 'admin'
    OR (SELECT hierarchy_level FROM app_users WHERE id = app_current_user_id() LIMIT 1) IN ('hk', 'forening')
    OR (SELECT role FROM app_users WHERE id = app_current_user_id() LIMIT 1) = 'manager'
  );

-- DELETE: also allow forening/hk and managers to delete their own lists
DROP POLICY IF EXISTS "Creators can delete their link lists" ON link_lists;
CREATE POLICY "Creators can delete their link lists"
  ON link_lists FOR DELETE
  TO anon
  USING (
    created_by = app_current_user_id()
    OR (SELECT role FROM app_users WHERE id = app_current_user_id() LIMIT 1) = 'admin'
    OR (SELECT hierarchy_level FROM app_users WHERE id = app_current_user_id() LIMIT 1) IN ('hk', 'forening')
    OR (SELECT role FROM app_users WHERE id = app_current_user_id() LIMIT 1) = 'manager'
  );

-- INSERT items: same broader check
CREATE POLICY "Managers and forening users can insert link items"
  ON link_list_items FOR INSERT
  TO anon
  WITH CHECK (
    (SELECT role FROM app_users WHERE id = app_current_user_id() LIMIT 1) = 'admin'
    OR (SELECT hierarchy_level FROM app_users WHERE id = app_current_user_id() LIMIT 1) IN ('hk', 'forening')
    OR (SELECT role FROM app_users WHERE id = app_current_user_id() LIMIT 1) = 'manager'
  );

-- UPDATE items
DROP POLICY IF EXISTS "Managers can update link items" ON link_list_items;
CREATE POLICY "Managers and forening users can update link items"
  ON link_list_items FOR UPDATE
  TO anon
  USING (
    (SELECT role FROM app_users WHERE id = app_current_user_id() LIMIT 1) = 'admin'
    OR (SELECT hierarchy_level FROM app_users WHERE id = app_current_user_id() LIMIT 1) IN ('hk', 'forening')
    OR (SELECT role FROM app_users WHERE id = app_current_user_id() LIMIT 1) = 'manager'
  )
  WITH CHECK (
    (SELECT role FROM app_users WHERE id = app_current_user_id() LIMIT 1) = 'admin'
    OR (SELECT hierarchy_level FROM app_users WHERE id = app_current_user_id() LIMIT 1) IN ('hk', 'forening')
    OR (SELECT role FROM app_users WHERE id = app_current_user_id() LIMIT 1) = 'manager'
  );

-- DELETE items
DROP POLICY IF EXISTS "Managers can delete link items" ON link_list_items;
CREATE POLICY "Managers and forening users can delete link items"
  ON link_list_items FOR DELETE
  TO anon
  USING (
    (SELECT role FROM app_users WHERE id = app_current_user_id() LIMIT 1) = 'admin'
    OR (SELECT hierarchy_level FROM app_users WHERE id = app_current_user_id() LIMIT 1) IN ('hk', 'forening')
    OR (SELECT role FROM app_users WHERE id = app_current_user_id() LIMIT 1) = 'manager'
  );
