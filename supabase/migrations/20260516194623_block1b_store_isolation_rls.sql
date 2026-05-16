/*
  # Block 1B: Store isolation RLS — manager store-scoped policies

  ## Problem
  All user_groups, user_group_members, and user_stores write policies are either
  fully open (USING true / WITH CHECK true) or role-based only, allowing any
  manager to create/edit groups and assign users to stores they do not manage.

  ## Fix
  Replace open policies with store-scoped ones that verify the acting manager
  actually manages the target store (via their own user_stores rows).

  ## Helper function
  app_user_manages_store(store_id) — returns true if the calling session user
  is an admin, or has a row in user_stores for the given store.

  ## Tables affected
  - user_groups (INSERT, UPDATE, DELETE)
  - user_group_members (INSERT, DELETE)
  - user_stores (INSERT, DELETE)
*/

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. Helper: does the current session user manage a specific store?
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app_user_manages_store(p_store_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admins manage all stores
  IF app_current_user_role() = 'admin' THEN RETURN true; END IF;
  -- Managers only manage stores they are explicitly assigned to
  RETURN EXISTS (
    SELECT 1 FROM user_stores
    WHERE user_id = app_current_user_id()
      AND store_id = p_store_id
  );
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. user_groups — replace open write policies with store-scoped ones
-- ──────────────────────────────────────────────────────────────────────────────

-- Drop existing overly-permissive write policies
DROP POLICY IF EXISTS "Authenticated users can insert user_groups" ON user_groups;
DROP POLICY IF EXISTS "Authenticated users can update user_groups" ON user_groups;
DROP POLICY IF EXISTS "Authenticated users can delete user_groups" ON user_groups;
-- Also drop any variant names from other migrations
DROP POLICY IF EXISTS "Admins and managers can insert user_groups" ON user_groups;
DROP POLICY IF EXISTS "Admins and managers can update user_groups" ON user_groups;
DROP POLICY IF EXISTS "Admins and managers can delete user_groups" ON user_groups;
DROP POLICY IF EXISTS "Managers can insert user_groups" ON user_groups;
DROP POLICY IF EXISTS "Managers can update user_groups" ON user_groups;
DROP POLICY IF EXISTS "Managers can delete user_groups" ON user_groups;

-- New store-scoped policies
CREATE POLICY "Managers can insert groups in their stores"
  ON user_groups FOR INSERT
  TO anon
  WITH CHECK (
    app_current_user_role() IN ('manager', 'admin')
    AND (store_id IS NULL OR app_user_manages_store(store_id))
  );

CREATE POLICY "Managers can update groups in their stores"
  ON user_groups FOR UPDATE
  TO anon
  USING (
    app_current_user_role() IN ('manager', 'admin')
    AND (store_id IS NULL OR app_user_manages_store(store_id))
  )
  WITH CHECK (
    app_current_user_role() IN ('manager', 'admin')
    AND (store_id IS NULL OR app_user_manages_store(store_id))
  );

CREATE POLICY "Managers can delete groups in their stores"
  ON user_groups FOR DELETE
  TO anon
  USING (
    app_current_user_role() IN ('manager', 'admin')
    AND (store_id IS NULL OR app_user_manages_store(store_id))
  );

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. user_group_members — managers may only modify members of their store groups
-- ──────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can insert user_group_members" ON user_group_members;
DROP POLICY IF EXISTS "Authenticated users can delete user_group_members" ON user_group_members;
DROP POLICY IF EXISTS "Admins and managers can insert user_group_members" ON user_group_members;
DROP POLICY IF EXISTS "Admins and managers can delete user_group_members" ON user_group_members;
DROP POLICY IF EXISTS "Managers can insert user_group_members" ON user_group_members;
DROP POLICY IF EXISTS "Managers can delete user_group_members" ON user_group_members;

CREATE POLICY "Managers can add members to their store groups"
  ON user_group_members FOR INSERT
  TO anon
  WITH CHECK (
    app_current_user_role() IN ('manager', 'admin')
    AND EXISTS (
      SELECT 1 FROM user_groups g
      WHERE g.id = group_id
        AND (g.store_id IS NULL OR app_user_manages_store(g.store_id))
    )
  );

CREATE POLICY "Managers can remove members from their store groups"
  ON user_group_members FOR DELETE
  TO anon
  USING (
    app_current_user_role() IN ('manager', 'admin')
    AND EXISTS (
      SELECT 1 FROM user_groups g
      WHERE g.id = group_id
        AND (g.store_id IS NULL OR app_user_manages_store(g.store_id))
    )
  );

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. user_stores — managers may only assign users to stores they themselves manage
-- ──────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins and managers can insert user_stores" ON user_stores;
DROP POLICY IF EXISTS "Admins and managers can delete user_stores" ON user_stores;
DROP POLICY IF EXISTS "Managers can insert user_stores" ON user_stores;
DROP POLICY IF EXISTS "Managers can delete user_stores" ON user_stores;

CREATE POLICY "Managers can assign users to their stores"
  ON user_stores FOR INSERT
  TO anon
  WITH CHECK (
    app_current_user_role() IN ('manager', 'admin')
    AND app_user_manages_store(store_id)
  );

CREATE POLICY "Managers can remove users from their stores"
  ON user_stores FOR DELETE
  TO anon
  USING (
    app_current_user_role() IN ('manager', 'admin')
    AND app_user_manages_store(store_id)
  );

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. user_groups SELECT — managers see only groups belonging to their stores
--    (or global groups with store_id IS NULL)
-- ──────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can read user_groups" ON user_groups;
DROP POLICY IF EXISTS "Anyone can view user_groups" ON user_groups;

CREATE POLICY "Users see groups in their stores"
  ON user_groups FOR SELECT
  TO anon
  USING (
    store_id IS NULL
    OR app_current_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM user_stores us
      WHERE us.user_id = app_current_user_id()
        AND us.store_id = user_groups.store_id
    )
  );

-- ──────────────────────────────────────────────────────────────────────────────
-- 6. user_group_members SELECT — open (members of visible groups are readable)
-- ──────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can read user_group_members" ON user_group_members;
DROP POLICY IF EXISTS "Anyone can view user_group_members" ON user_group_members;

CREATE POLICY "Users see members of their store groups"
  ON user_group_members FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM user_groups g
      WHERE g.id = group_id
        AND (
          g.store_id IS NULL
          OR app_current_user_role() = 'admin'
          OR EXISTS (
            SELECT 1 FROM user_stores us
            WHERE us.user_id = app_current_user_id()
              AND us.store_id = g.store_id
          )
        )
    )
  );
