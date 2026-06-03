/*
  # Fix link_lists SELECT policy to allow admins to see all lists

  Problem: Admin users (role='admin') can create link lists for any store/forening via the
  INSERT policy, but the SELECT policy only returns records based on store membership and
  forening_id — admins who aren't explicitly in a store's user_stores cannot see the lists
  they create, making them appear to "not save."

  Fix:
  - Drop and recreate the SELECT policy on link_lists to add an admin bypass
  - Also fix link_list_items SELECT policy to allow admins to see all items
*/

-- Drop existing SELECT policies
DROP POLICY IF EXISTS "Users can view relevant link lists" ON link_lists;
DROP POLICY IF EXISTS "Users can view items in accessible lists" ON link_list_items;

-- Recreate SELECT for link_lists with admin bypass
CREATE POLICY "Users can view relevant link lists"
  ON link_lists FOR SELECT
  TO anon
  USING (
    -- Admins and HK-level users see everything
    (SELECT role FROM app_users WHERE id = app_current_user_id() LIMIT 1) = 'admin'
    OR (SELECT hierarchy_level FROM app_users WHERE id = app_current_user_id() LIMIT 1) = 'hk'
    -- HK-scoped lists visible to all authenticated users
    OR scope = 'hk'
    -- Forening-scoped: user's forening matches
    OR (
      scope = 'forening'
      AND forening_id IS NOT NULL
      AND forening_id = (SELECT forening_id FROM app_users WHERE id = app_current_user_id() LIMIT 1)
    )
    -- Store-scoped: user is member of that store
    OR (
      scope = 'store'
      AND store_id IS NOT NULL
      AND store_id IN (SELECT store_id FROM user_stores WHERE user_id = app_current_user_id())
    )
  );

-- Recreate SELECT for link_list_items — inherit visibility from the list's policy
CREATE POLICY "Users can view items in accessible lists"
  ON link_list_items FOR SELECT
  TO anon
  USING (
    list_id IN (SELECT id FROM link_lists)
  );
