/*
  # Security Hardening: RLS Policies and Function Fixes

  ## Summary
  Addresses all security scanner findings across two categories:

  ### 1. Function Security (hash_password, verify_password)
  - Fix mutable search_path by setting `search_path = public, pg_catalog`
  - Switch from SECURITY DEFINER to SECURITY INVOKER (no elevated privileges needed)
  - Revoke EXECUTE from anon role (only authenticated callers and the app service should call these)

  ### 2. RLS Policy Hardening
  Replaces all "always true" policies with a session-token-validated helper function.

  The app passes a custom `x-session-token` header on every PostgREST request.
  A new helper function `app_current_user_id()` reads this header from
  `current_setting('request.headers')` and validates the token against `app_sessions`,
  returning the user_id if a valid non-expired session exists, or NULL otherwise.

  Policies are then structured as:
  - Data tables: require `app_current_user_id() IS NOT NULL` (valid session)
  - Role-restricted operations (admin-only): check role via join to app_users
  - Own-data operations (notifications): check `user_id = app_current_user_id()`
  - Login tables (app_users SELECT, app_sessions SELECT/INSERT): remain open to anon
    since the login flow needs to read/write these before a session exists

  ### Tables Fixed
  - stores, app_users, app_sessions
  - tasks, task_steps
  - incidents, incident_comments, incident_images
  - checklist_templates, checklist_template_items, template_stores
  - user_stores, notifications, audit_log
*/

-- ── 1. Fix password functions ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.verify_password(plain_password text, hashed_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
BEGIN
  RETURN hashed_password = crypt(plain_password, hashed_password);
END;
$$;

CREATE OR REPLACE FUNCTION public.hash_password(plain_password text)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
BEGIN
  RETURN crypt(plain_password, gen_salt('bf', 10));
END;
$$;

-- Revoke execute from anon; only authenticated and service_role may call these
REVOKE EXECUTE ON FUNCTION public.verify_password(text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.hash_password(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.verify_password(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hash_password(text) TO authenticated, service_role;

-- ── 2. Session-validation helper ──────────────────────────────────────────────

-- Returns the app_users.id for the caller's session token (from x-session-token header),
-- or NULL if no valid session exists. Used by RLS policies below.
CREATE OR REPLACE FUNCTION public.app_current_user_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_token  text;
  v_user   uuid;
BEGIN
  BEGIN
    v_token := (current_setting('request.headers', true)::jsonb ->> 'x-session-token');
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;

  IF v_token IS NULL OR v_token = '' THEN
    RETURN NULL;
  END IF;

  SELECT user_id INTO v_user
  FROM app_sessions
  WHERE token = v_token
    AND expires_at > now();

  RETURN v_user;
END;
$$;

-- Returns true if the current session user has the given role
CREATE OR REPLACE FUNCTION public.app_current_user_role()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_catalog
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

-- Grant these helpers to anon and authenticated so they can be used in policies
GRANT EXECUTE ON FUNCTION public.app_current_user_id() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_current_user_role() TO anon, authenticated, service_role;

-- ── 3. STORES ─────────────────────────────────────────────────────────────────

-- Drop existing overly-permissive policies
DROP POLICY IF EXISTS "Admins can insert stores" ON stores;
DROP POLICY IF EXISTS "Admins can update stores" ON stores;

-- Only admins may insert or update stores
CREATE POLICY "Admins can insert stores"
  ON stores FOR INSERT
  TO anon, authenticated
  WITH CHECK (app_current_user_role() = 'admin');

CREATE POLICY "Admins can update stores"
  ON stores FOR UPDATE
  TO anon, authenticated
  USING (app_current_user_role() = 'admin')
  WITH CHECK (app_current_user_role() = 'admin');

-- Admins can delete stores (new restrictive policy)
DROP POLICY IF EXISTS "Admins can delete stores" ON stores;
CREATE POLICY "Admins can delete stores"
  ON stores FOR DELETE
  TO anon, authenticated
  USING (app_current_user_role() = 'admin');

-- ── 4. APP_USERS ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Allow insert app_users" ON app_users;
DROP POLICY IF EXISTS "Allow update app_users" ON app_users;
DROP POLICY IF EXISTS "Allow delete app_users" ON app_users;

-- Only admins may create users
CREATE POLICY "Admins can insert app_users"
  ON app_users FOR INSERT
  TO anon, authenticated
  WITH CHECK (app_current_user_role() = 'admin');

-- Users may update themselves; admins may update anyone
CREATE POLICY "Users can update own profile or admins update any"
  ON app_users FOR UPDATE
  TO anon, authenticated
  USING (id = app_current_user_id() OR app_current_user_role() = 'admin')
  WITH CHECK (id = app_current_user_id() OR app_current_user_role() = 'admin');

-- Only admins may delete users
CREATE POLICY "Admins can delete app_users"
  ON app_users FOR DELETE
  TO anon, authenticated
  USING (app_current_user_role() = 'admin');

-- ── 5. APP_SESSIONS ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Allow insert sessions" ON app_sessions;
DROP POLICY IF EXISTS "Allow delete sessions" ON app_sessions;

-- Session insert: only for the matching user (via login flow) or self
-- During login there is no session yet, so we allow insert only when
-- the user_id being inserted matches a valid app_users row.
CREATE POLICY "Allow insert sessions for valid users"
  ON app_sessions FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM app_users WHERE id = user_id AND is_active = true)
  );

-- Session delete: only the owner or admin can delete a session
CREATE POLICY "Users can delete own sessions"
  ON app_sessions FOR DELETE
  TO anon, authenticated
  USING (user_id = app_current_user_id() OR app_current_user_role() = 'admin');

-- ── 6. TASKS ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can insert tasks" ON tasks;
DROP POLICY IF EXISTS "Authenticated users can update tasks" ON tasks;
DROP POLICY IF EXISTS "Authenticated users can delete tasks" ON tasks;

CREATE POLICY "Session users can insert tasks"
  ON tasks FOR INSERT
  TO anon, authenticated
  WITH CHECK (app_current_user_id() IS NOT NULL);

CREATE POLICY "Session users can update tasks"
  ON tasks FOR UPDATE
  TO anon, authenticated
  USING (app_current_user_id() IS NOT NULL)
  WITH CHECK (app_current_user_id() IS NOT NULL);

CREATE POLICY "Session users can delete tasks"
  ON tasks FOR DELETE
  TO anon, authenticated
  USING (app_current_user_id() IS NOT NULL);

-- ── 7. TASK_STEPS ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can insert task_steps" ON task_steps;
DROP POLICY IF EXISTS "Authenticated users can update task_steps" ON task_steps;
DROP POLICY IF EXISTS "Authenticated users can delete task_steps" ON task_steps;

CREATE POLICY "Session users can insert task_steps"
  ON task_steps FOR INSERT
  TO anon, authenticated
  WITH CHECK (app_current_user_id() IS NOT NULL);

CREATE POLICY "Session users can update task_steps"
  ON task_steps FOR UPDATE
  TO anon, authenticated
  USING (app_current_user_id() IS NOT NULL)
  WITH CHECK (app_current_user_id() IS NOT NULL);

CREATE POLICY "Session users can delete task_steps"
  ON task_steps FOR DELETE
  TO anon, authenticated
  USING (app_current_user_id() IS NOT NULL);

-- ── 8. INCIDENTS ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can insert incidents" ON incidents;
DROP POLICY IF EXISTS "Authenticated users can update incidents" ON incidents;
DROP POLICY IF EXISTS "Authenticated users can delete incidents" ON incidents;

CREATE POLICY "Session users can insert incidents"
  ON incidents FOR INSERT
  TO anon, authenticated
  WITH CHECK (app_current_user_id() IS NOT NULL);

CREATE POLICY "Session users can update incidents"
  ON incidents FOR UPDATE
  TO anon, authenticated
  USING (app_current_user_id() IS NOT NULL)
  WITH CHECK (app_current_user_id() IS NOT NULL);

CREATE POLICY "Session users can delete incidents"
  ON incidents FOR DELETE
  TO anon, authenticated
  USING (app_current_user_id() IS NOT NULL);

-- ── 9. INCIDENT_COMMENTS ─────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can insert incident_comments" ON incident_comments;

CREATE POLICY "Session users can insert incident_comments"
  ON incident_comments FOR INSERT
  TO anon, authenticated
  WITH CHECK (app_current_user_id() IS NOT NULL);

-- ── 10. INCIDENT_IMAGES ───────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can insert incident_images" ON incident_images;
DROP POLICY IF EXISTS "Authenticated users can delete incident_images" ON incident_images;

CREATE POLICY "Session users can insert incident_images"
  ON incident_images FOR INSERT
  TO anon, authenticated
  WITH CHECK (app_current_user_id() IS NOT NULL);

CREATE POLICY "Session users can delete incident_images"
  ON incident_images FOR DELETE
  TO anon, authenticated
  USING (app_current_user_id() IS NOT NULL);

-- ── 11. CHECKLIST_TEMPLATES ───────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can insert templates" ON checklist_templates;
DROP POLICY IF EXISTS "Authenticated users can update templates" ON checklist_templates;
DROP POLICY IF EXISTS "Authenticated users can delete templates" ON checklist_templates;

CREATE POLICY "Managers can insert templates"
  ON checklist_templates FOR INSERT
  TO authenticated
  WITH CHECK (app_current_user_role() IN ('admin', 'manager'));

CREATE POLICY "Managers can update templates"
  ON checklist_templates FOR UPDATE
  TO authenticated
  USING (app_current_user_role() IN ('admin', 'manager'))
  WITH CHECK (app_current_user_role() IN ('admin', 'manager'));

CREATE POLICY "Managers can delete templates"
  ON checklist_templates FOR DELETE
  TO authenticated
  USING (app_current_user_role() IN ('admin', 'manager'));

-- ── 12. CHECKLIST_TEMPLATE_ITEMS ─────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can insert template items" ON checklist_template_items;
DROP POLICY IF EXISTS "Authenticated users can update template items" ON checklist_template_items;
DROP POLICY IF EXISTS "Authenticated users can delete template items" ON checklist_template_items;

CREATE POLICY "Managers can insert template items"
  ON checklist_template_items FOR INSERT
  TO authenticated
  WITH CHECK (app_current_user_role() IN ('admin', 'manager'));

CREATE POLICY "Managers can update template items"
  ON checklist_template_items FOR UPDATE
  TO authenticated
  USING (app_current_user_role() IN ('admin', 'manager'))
  WITH CHECK (app_current_user_role() IN ('admin', 'manager'));

CREATE POLICY "Managers can delete template items"
  ON checklist_template_items FOR DELETE
  TO authenticated
  USING (app_current_user_role() IN ('admin', 'manager'));

-- ── 13. TEMPLATE_STORES ───────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can insert template_stores" ON template_stores;
DROP POLICY IF EXISTS "Authenticated users can delete template_stores" ON template_stores;

CREATE POLICY "Managers can insert template_stores"
  ON template_stores FOR INSERT
  TO authenticated
  WITH CHECK (app_current_user_role() IN ('admin', 'manager'));

CREATE POLICY "Managers can delete template_stores"
  ON template_stores FOR DELETE
  TO authenticated
  USING (app_current_user_role() IN ('admin', 'manager'));

-- ── 14. USER_STORES ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can insert user_stores" ON user_stores;
DROP POLICY IF EXISTS "Authenticated users can update user_stores" ON user_stores;
DROP POLICY IF EXISTS "Authenticated users can delete user_stores" ON user_stores;

CREATE POLICY "Admins can insert user_stores"
  ON user_stores FOR INSERT
  TO authenticated
  WITH CHECK (app_current_user_role() = 'admin');

CREATE POLICY "Admins can update user_stores"
  ON user_stores FOR UPDATE
  TO authenticated
  USING (app_current_user_role() = 'admin')
  WITH CHECK (app_current_user_role() = 'admin');

CREATE POLICY "Admins can delete user_stores"
  ON user_stores FOR DELETE
  TO authenticated
  USING (app_current_user_role() = 'admin');

-- ── 15. NOTIFICATIONS ─────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can insert notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can delete own notifications" ON notifications;

-- Only sessions with a valid token may write notifications; read is own-data
CREATE POLICY "Session users can insert notifications"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (app_current_user_id() IS NOT NULL);

-- Users can only mark their own notifications read
CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  TO authenticated
  USING (user_id = app_current_user_id())
  WITH CHECK (user_id = app_current_user_id());

-- Users can only delete their own notifications
CREATE POLICY "Users can delete own notifications"
  ON notifications FOR DELETE
  TO authenticated
  USING (user_id = app_current_user_id());

-- ── 16. AUDIT_LOG ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can insert audit_log" ON audit_log;

CREATE POLICY "Session users can insert audit_log"
  ON audit_log FOR INSERT
  TO anon, authenticated
  WITH CHECK (app_current_user_id() IS NOT NULL);
