/*
  # Fix kundrunda_assignments and support_tickets RLS to use session-based auth

  StoreFlow authenticates via custom x-session-token header, not Supabase Auth
  JWT. Using auth.uid() returns NULL in this setup, causing 401 on writes.

  This migration updates policies on:
  - kundrunda_assignments
  - support_tickets
  - support_ticket_replies

  to use app_current_user_id() and app_current_user_role() consistently
  with every other table in the codebase.
*/

-- ═══════════════════════════════════════════
-- kundrunda_assignments
-- ═══════════════════════════════════════════

DROP POLICY IF EXISTS "kundrunda_assignments_select" ON kundrunda_assignments;
DROP POLICY IF EXISTS "kundrunda_assignments_admin_write" ON kundrunda_assignments;

-- SELECT: all authenticated session users can read (same as before)
CREATE POLICY "kundrunda_assignments_select" ON kundrunda_assignments
  FOR SELECT USING (app_current_user_id() IS NOT NULL);

-- INSERT/UPDATE/DELETE: admin/manager only
CREATE POLICY "kundrunda_assignments_admin_write" ON kundrunda_assignments
  FOR ALL USING (
    app_current_user_role() IN ('admin', 'manager')
  )
  WITH CHECK (
    app_current_user_role() IN ('admin', 'manager')
  );

-- ═══════════════════════════════════════════
-- support_tickets
-- ═══════════════════════════════════════════

DROP POLICY IF EXISTS "support_tickets_user_select" ON support_tickets;
DROP POLICY IF EXISTS "support_tickets_admin_select" ON support_tickets;
DROP POLICY IF EXISTS "support_tickets_insert" ON support_tickets;
DROP POLICY IF EXISTS "support_tickets_admin_update" ON support_tickets;

-- SELECT: user sees own tickets; admin/manager sees all in their store
CREATE POLICY "support_tickets_user_select" ON support_tickets
  FOR SELECT USING (
    user_id = app_current_user_id()
  );

CREATE POLICY "support_tickets_admin_select" ON support_tickets
  FOR SELECT USING (
    app_current_user_role() IN ('admin', 'manager')
  );

-- INSERT: any authenticated user can create their own ticket
CREATE POLICY "support_tickets_insert" ON support_tickets
  FOR INSERT WITH CHECK (
    user_id = app_current_user_id()
  );

-- UPDATE: admin/manager only
CREATE POLICY "support_tickets_admin_update" ON support_tickets
  FOR UPDATE USING (
    app_current_user_role() IN ('admin', 'manager')
  )
  WITH CHECK (
    app_current_user_role() IN ('admin', 'manager')
  );

-- ═══════════════════════════════════════════
-- support_ticket_replies
-- ═══════════════════════════════════════════

DROP POLICY IF EXISTS "support_replies_select" ON support_ticket_replies;
DROP POLICY IF EXISTS "support_replies_admin_insert" ON support_ticket_replies;

-- SELECT: admin/manager can read all; users can read replies on their tickets
CREATE POLICY "support_replies_select" ON support_ticket_replies
  FOR SELECT USING (
    app_current_user_role() IN ('admin', 'manager')
    OR EXISTS (
      SELECT 1 FROM support_tickets t
      WHERE t.id = ticket_id
      AND t.user_id = app_current_user_id()
    )
  );

-- INSERT: admin/manager only
CREATE POLICY "support_replies_admin_insert" ON support_ticket_replies
  FOR INSERT WITH CHECK (
    app_current_user_role() IN ('admin', 'manager')
  );
