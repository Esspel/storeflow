/*
  # Fix RLS policies for meetings and kundrunda tables

  ## Problem
  The app uses a custom session-token auth system with app_current_user_id() instead
  of Supabase Auth's auth.uid(). The meetings and kundrunda tables were migrated with
  policies using auth.uid() which always returns NULL, causing all reads/writes to fail.

  ## Changes
  - Drop all auth.uid() policies on meetings, meeting_agenda_items, meeting_decisions,
    kundrunda_sessions, kundrunda_responses, kundrunda_zones, kundrunda_checkpoints
  - Re-create them using app_current_user_id() to match the rest of the app
*/

-- ── meetings ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can view meetings for their stores" ON meetings;
DROP POLICY IF EXISTS "Authenticated users can insert meetings" ON meetings;
DROP POLICY IF EXISTS "Meeting creator can update meeting" ON meetings;
DROP POLICY IF EXISTS "Meeting creator can delete meeting" ON meetings;

CREATE POLICY "Users can view meetings for their stores"
  ON meetings FOR SELECT TO anon
  USING (
    app_current_user_id() IS NOT NULL
    AND (
      store_id IN (SELECT store_id FROM user_stores WHERE user_id = app_current_user_id())
      OR created_by = app_current_user_id()
    )
  );

CREATE POLICY "Authenticated users can insert meetings"
  ON meetings FOR INSERT TO anon
  WITH CHECK (
    app_current_user_id() IS NOT NULL
    AND created_by = app_current_user_id()
  );

CREATE POLICY "Meeting creator or manager can update meeting"
  ON meetings FOR UPDATE TO anon
  USING (
    app_current_user_id() IS NOT NULL
    AND (
      created_by = app_current_user_id()
      OR (SELECT role FROM app_users WHERE id = app_current_user_id()) IN ('manager', 'admin')
    )
  )
  WITH CHECK (
    app_current_user_id() IS NOT NULL
    AND (
      created_by = app_current_user_id()
      OR (SELECT role FROM app_users WHERE id = app_current_user_id()) IN ('manager', 'admin')
    )
  );

CREATE POLICY "Meeting creator or admin can delete meeting"
  ON meetings FOR DELETE TO anon
  USING (
    app_current_user_id() IS NOT NULL
    AND (
      created_by = app_current_user_id()
      OR (SELECT role FROM app_users WHERE id = app_current_user_id()) IN ('manager', 'admin')
    )
  );

-- ── meeting_agenda_items ──────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can view agenda items for accessible meetings" ON meeting_agenda_items;
DROP POLICY IF EXISTS "Authenticated users can insert agenda items" ON meeting_agenda_items;
DROP POLICY IF EXISTS "Authenticated users can update agenda items" ON meeting_agenda_items;
DROP POLICY IF EXISTS "Meeting creator can delete agenda items" ON meeting_agenda_items;

CREATE POLICY "Users can view agenda items for accessible meetings"
  ON meeting_agenda_items FOR SELECT TO anon
  USING (
    app_current_user_id() IS NOT NULL
    AND meeting_id IN (
      SELECT id FROM meetings
      WHERE store_id IN (SELECT store_id FROM user_stores WHERE user_id = app_current_user_id())
         OR created_by = app_current_user_id()
    )
  );

CREATE POLICY "Authenticated users can insert agenda items"
  ON meeting_agenda_items FOR INSERT TO anon
  WITH CHECK (
    app_current_user_id() IS NOT NULL
    AND meeting_id IN (
      SELECT id FROM meetings
      WHERE created_by = app_current_user_id()
         OR store_id IN (SELECT store_id FROM user_stores WHERE user_id = app_current_user_id())
    )
  );

CREATE POLICY "Authenticated users can update agenda items"
  ON meeting_agenda_items FOR UPDATE TO anon
  USING (
    app_current_user_id() IS NOT NULL
    AND meeting_id IN (
      SELECT id FROM meetings
      WHERE created_by = app_current_user_id()
         OR store_id IN (SELECT store_id FROM user_stores WHERE user_id = app_current_user_id())
    )
  )
  WITH CHECK (
    app_current_user_id() IS NOT NULL
    AND meeting_id IN (
      SELECT id FROM meetings
      WHERE created_by = app_current_user_id()
         OR store_id IN (SELECT store_id FROM user_stores WHERE user_id = app_current_user_id())
    )
  );

CREATE POLICY "Authenticated users can delete agenda items"
  ON meeting_agenda_items FOR DELETE TO anon
  USING (
    app_current_user_id() IS NOT NULL
    AND meeting_id IN (
      SELECT id FROM meetings
      WHERE created_by = app_current_user_id()
         OR store_id IN (SELECT store_id FROM user_stores WHERE user_id = app_current_user_id())
    )
  );

-- ── meeting_decisions ─────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can view decisions for accessible meetings" ON meeting_decisions;
DROP POLICY IF EXISTS "Authenticated users can insert decisions" ON meeting_decisions;
DROP POLICY IF EXISTS "Decision creator can update decision" ON meeting_decisions;
DROP POLICY IF EXISTS "Decision creator can delete decision" ON meeting_decisions;

CREATE POLICY "Users can view decisions for accessible meetings"
  ON meeting_decisions FOR SELECT TO anon
  USING (
    app_current_user_id() IS NOT NULL
    AND meeting_id IN (
      SELECT id FROM meetings
      WHERE store_id IN (SELECT store_id FROM user_stores WHERE user_id = app_current_user_id())
         OR created_by = app_current_user_id()
    )
  );

CREATE POLICY "Authenticated users can insert decisions"
  ON meeting_decisions FOR INSERT TO anon
  WITH CHECK (
    app_current_user_id() IS NOT NULL
    AND meeting_id IN (
      SELECT id FROM meetings
      WHERE created_by = app_current_user_id()
         OR store_id IN (SELECT store_id FROM user_stores WHERE user_id = app_current_user_id())
    )
  );

CREATE POLICY "Decision creator can update decision"
  ON meeting_decisions FOR UPDATE TO anon
  USING (app_current_user_id() IS NOT NULL AND created_by = app_current_user_id())
  WITH CHECK (app_current_user_id() IS NOT NULL AND created_by = app_current_user_id());

CREATE POLICY "Decision creator can delete decision"
  ON meeting_decisions FOR DELETE TO anon
  USING (app_current_user_id() IS NOT NULL AND created_by = app_current_user_id());

-- ── kundrunda_zones ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can read zones" ON kundrunda_zones;
DROP POLICY IF EXISTS "Valid session can read zones" ON kundrunda_zones;
DROP POLICY IF EXISTS "Managers can insert zones" ON kundrunda_zones;
DROP POLICY IF EXISTS "Managers can update zones" ON kundrunda_zones;
DROP POLICY IF EXISTS "Managers can delete zones" ON kundrunda_zones;

CREATE POLICY "Valid session can read zones"
  ON kundrunda_zones FOR SELECT TO anon
  USING (app_current_user_id() IS NOT NULL);

CREATE POLICY "Managers can insert zones"
  ON kundrunda_zones FOR INSERT TO anon
  WITH CHECK (
    app_current_user_id() IS NOT NULL
    AND (SELECT role FROM app_users WHERE id = app_current_user_id()) IN ('manager', 'admin')
  );

CREATE POLICY "Managers can update zones"
  ON kundrunda_zones FOR UPDATE TO anon
  USING (app_current_user_id() IS NOT NULL AND (SELECT role FROM app_users WHERE id = app_current_user_id()) IN ('manager', 'admin'))
  WITH CHECK (app_current_user_id() IS NOT NULL AND (SELECT role FROM app_users WHERE id = app_current_user_id()) IN ('manager', 'admin'));

CREATE POLICY "Managers can delete zones"
  ON kundrunda_zones FOR DELETE TO anon
  USING (app_current_user_id() IS NOT NULL AND (SELECT role FROM app_users WHERE id = app_current_user_id()) IN ('manager', 'admin'));

-- ── kundrunda_checkpoints ──────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can read checkpoints" ON kundrunda_checkpoints;
DROP POLICY IF EXISTS "Valid session can read checkpoints" ON kundrunda_checkpoints;
DROP POLICY IF EXISTS "Managers can insert checkpoints" ON kundrunda_checkpoints;
DROP POLICY IF EXISTS "Managers can update checkpoints" ON kundrunda_checkpoints;
DROP POLICY IF EXISTS "Managers can delete checkpoints" ON kundrunda_checkpoints;

CREATE POLICY "Valid session can read checkpoints"
  ON kundrunda_checkpoints FOR SELECT TO anon
  USING (app_current_user_id() IS NOT NULL);

CREATE POLICY "Managers can insert checkpoints"
  ON kundrunda_checkpoints FOR INSERT TO anon
  WITH CHECK (app_current_user_id() IS NOT NULL AND (SELECT role FROM app_users WHERE id = app_current_user_id()) IN ('manager', 'admin'));

CREATE POLICY "Managers can update checkpoints"
  ON kundrunda_checkpoints FOR UPDATE TO anon
  USING (app_current_user_id() IS NOT NULL AND (SELECT role FROM app_users WHERE id = app_current_user_id()) IN ('manager', 'admin'))
  WITH CHECK (app_current_user_id() IS NOT NULL AND (SELECT role FROM app_users WHERE id = app_current_user_id()) IN ('manager', 'admin'));

CREATE POLICY "Managers can delete checkpoints"
  ON kundrunda_checkpoints FOR DELETE TO anon
  USING (app_current_user_id() IS NOT NULL AND (SELECT role FROM app_users WHERE id = app_current_user_id()) IN ('manager', 'admin'));

-- ── kundrunda_sessions ─────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can view sessions for their stores" ON kundrunda_sessions;
DROP POLICY IF EXISTS "Authenticated users can insert sessions" ON kundrunda_sessions;
DROP POLICY IF EXISTS "Session owner can update their session" ON kundrunda_sessions;
DROP POLICY IF EXISTS "Session owner or store member can update session" ON kundrunda_sessions;

CREATE POLICY "Users can view sessions for their stores"
  ON kundrunda_sessions FOR SELECT TO anon
  USING (
    app_current_user_id() IS NOT NULL
    AND (
      conducted_by = app_current_user_id()
      OR store_id IN (SELECT store_id FROM user_stores WHERE user_id = app_current_user_id())
    )
  );

CREATE POLICY "Authenticated users can insert sessions"
  ON kundrunda_sessions FOR INSERT TO anon
  WITH CHECK (
    app_current_user_id() IS NOT NULL
    AND conducted_by = app_current_user_id()
  );

CREATE POLICY "Session owner or store member can update session"
  ON kundrunda_sessions FOR UPDATE TO anon
  USING (
    app_current_user_id() IS NOT NULL
    AND (
      conducted_by = app_current_user_id()
      OR store_id IN (SELECT store_id FROM user_stores WHERE user_id = app_current_user_id())
    )
  )
  WITH CHECK (
    app_current_user_id() IS NOT NULL
    AND (
      conducted_by = app_current_user_id()
      OR store_id IN (SELECT store_id FROM user_stores WHERE user_id = app_current_user_id())
    )
  );

-- ── kundrunda_responses ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can view responses for their sessions" ON kundrunda_responses;
DROP POLICY IF EXISTS "Authenticated users can insert responses" ON kundrunda_responses;
DROP POLICY IF EXISTS "Authenticated users can update responses in their sessions" ON kundrunda_responses;

CREATE POLICY "Users can view responses for their sessions"
  ON kundrunda_responses FOR SELECT TO anon
  USING (
    app_current_user_id() IS NOT NULL
    AND session_id IN (
      SELECT id FROM kundrunda_sessions
      WHERE conducted_by = app_current_user_id()
         OR store_id IN (SELECT store_id FROM user_stores WHERE user_id = app_current_user_id())
    )
  );

CREATE POLICY "Authenticated users can insert responses"
  ON kundrunda_responses FOR INSERT TO anon
  WITH CHECK (
    app_current_user_id() IS NOT NULL
    AND session_id IN (
      SELECT id FROM kundrunda_sessions
      WHERE conducted_by = app_current_user_id()
         OR store_id IN (SELECT store_id FROM user_stores WHERE user_id = app_current_user_id())
    )
  );

CREATE POLICY "Authenticated users can update responses in their sessions"
  ON kundrunda_responses FOR UPDATE TO anon
  USING (
    app_current_user_id() IS NOT NULL
    AND session_id IN (
      SELECT id FROM kundrunda_sessions
      WHERE conducted_by = app_current_user_id()
         OR store_id IN (SELECT store_id FROM user_stores WHERE user_id = app_current_user_id())
    )
  )
  WITH CHECK (
    app_current_user_id() IS NOT NULL
    AND session_id IN (
      SELECT id FROM kundrunda_sessions
      WHERE conducted_by = app_current_user_id()
         OR store_id IN (SELECT store_id FROM user_stores WHERE user_id = app_current_user_id())
    )
  );
