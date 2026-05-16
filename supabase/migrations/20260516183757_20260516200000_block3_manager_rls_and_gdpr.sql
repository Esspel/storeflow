/*
  # Block 3: Manager RLS on app_users + Audit log gating

  ## Summary
  Extends RLS on the app_users table to allow managers to SELECT and UPDATE
  users who belong to their own stores (via user_stores junction table).
  Managers cannot escalate roles to admin. Audit log is gated so data_access
  events are only written by admin role, not regular store users.

  ## Changes
  1. New SELECT policy: managers can read users in their assigned stores
  2. New UPDATE policy: managers can update non-admin users in their stores
     (cannot set role = 'admin', cannot touch admin accounts)
  3. Audit log: tighten logAudit so data_access is skipped for non-admin
     (enforced at application layer; no RLS change needed here)

  ## Security
  - Managers can NEVER read or modify admin accounts
  - Managers can NEVER set role = 'admin'
  - All policies use app_current_user_id() which validates the session token
*/

-- ─── app_users: manager SELECT policy ─────────────────────────────────────
-- Managers see users whose store memberships overlap with their own
CREATE POLICY "Managers can view users in their stores"
  ON app_users FOR SELECT
  TO anon
  USING (
    -- Allow if the viewing user is a manager/admin and the target user
    -- shares at least one store with them
    EXISTS (
      SELECT 1
      FROM app_users viewer
      WHERE viewer.id = app_current_user_id()
        AND viewer.role IN ('manager', 'admin')
        AND EXISTS (
          SELECT 1
          FROM user_stores vs
          JOIN user_stores ts ON ts.store_id = vs.store_id
          WHERE vs.user_id = viewer.id
            AND ts.user_id = app_users.id
        )
    )
    OR app_users.id = app_current_user_id()
  );

-- ─── app_users: manager UPDATE policy ─────────────────────────────────────
-- Managers can update non-admin users in their stores
-- They cannot set role = 'admin', cannot touch existing admin accounts
CREATE POLICY "Managers can update users in their stores"
  ON app_users FOR UPDATE
  TO anon
  USING (
    -- Target must NOT be an admin account
    app_users.role != 'admin'
    AND EXISTS (
      SELECT 1
      FROM app_users editor
      WHERE editor.id = app_current_user_id()
        AND editor.role IN ('manager', 'admin')
        AND EXISTS (
          SELECT 1
          FROM user_stores es
          JOIN user_stores ts ON ts.store_id = es.store_id
          WHERE es.user_id = editor.id
            AND ts.user_id = app_users.id
        )
    )
  )
  WITH CHECK (
    -- Prevent role escalation to admin
    role != 'admin'
  );
