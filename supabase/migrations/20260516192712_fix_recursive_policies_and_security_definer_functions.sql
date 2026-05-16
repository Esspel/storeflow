/*
  # Fix infinite recursion in app_users UPDATE/DELETE policies

  ## Problem
  Multiple policies on app_users contain self-referencing subqueries like:
    EXISTS (SELECT 1 FROM app_users u WHERE u.id = app_current_user_id() AND u.role = 'admin')
  
  Additionally, app_current_user_role() itself queries app_users, which triggers
  RLS policy evaluation recursively when called from within those same policies.

  ## Fix
  1. Make app_current_user_role() SECURITY DEFINER so it bypasses RLS
  2. Drop all self-referencing UPDATE/DELETE policies
  3. Replace with clean policies using app_current_user_role() (which no longer
     triggers recursion since it's SECURITY DEFINER)
  4. Keep the existing "Users can update own profile or admins update any" policy 
     which correctly uses app_current_user_id() and app_current_user_role()

  ## Tables affected
  - app_users (UPDATE, DELETE policies)
  
  ## Functions modified
  - app_current_user_role() — now SECURITY DEFINER
*/

-- Step 1: Recreate app_current_user_role() as SECURITY DEFINER
CREATE OR REPLACE FUNCTION app_current_user_role()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role
  FROM app_users
  WHERE id = app_current_user_id();
  RETURN v_role;
END;
$$;

-- Step 2: Drop recursive UPDATE policies
DROP POLICY IF EXISTS "Admins update any user" ON app_users;
DROP POLICY IF EXISTS "Managers can update users in their stores" ON app_users;
DROP POLICY IF EXISTS "Users update own profile" ON app_users;

-- Step 3: Drop recursive DELETE policies
DROP POLICY IF EXISTS "Admins delete any user" ON app_users;

-- Step 4: The remaining policies are non-recursive:
-- - "Users can update own profile or admins update any" uses app_current_user_id() and app_current_user_role()
-- - "Admins can delete app_users" uses app_current_user_role()
-- These now work correctly because app_current_user_role() is SECURITY DEFINER.

-- Step 5: Add manager UPDATE policy using the safe function
CREATE POLICY "Managers can update non-admin users"
  ON app_users FOR UPDATE
  TO anon
  USING (
    role <> 'admin' AND
    app_current_user_role() IN ('manager', 'admin')
  )
  WITH CHECK (
    role <> 'admin' AND
    app_current_user_role() IN ('manager', 'admin')
  );
