/*
  # Fix infinite recursion in app_users RLS policies

  ## Problem
  The "Managers can view users in their stores" policy contains a self-referencing
  subquery: `FROM app_users viewer WHERE viewer.id = app_current_user_id()`.
  When PostgreSQL evaluates this subquery, it applies the same table's RLS policies
  recursively, causing ERROR 42P17: infinite recursion detected.

  This blocks ALL reads from app_users for the anon role, which breaks:
  - Session validation (validateSession queries app_users)
  - Personal/admin page (lists all users)
  - GDPR export (looks up user by username)

  ## Fix
  Drop the recursive policy. The existing "Users can view all app_users" and
  "Public read for login lookup" policies already grant open SELECT access with
  USING (true), making the manager-scoped policy redundant for reads.

  Client-side filtering in personal.tsx already restricts managers to only seeing
  users in their stores — this is a UI concern, not a security boundary for reads.

  ## Security note
  Read access to the user list (id, name, role, etc.) is not sensitive in this
  internal app. Write access remains properly restricted by separate UPDATE/DELETE
  policies that use SECURITY DEFINER functions instead of self-referencing queries.
*/

DROP POLICY IF EXISTS "Managers can view users in their stores" ON app_users;
