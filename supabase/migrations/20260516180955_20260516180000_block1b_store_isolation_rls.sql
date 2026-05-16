
/*
  # Block 1b: Store Isolation — app_current_store_id() + RLS Tightening

  ## Summary
  Adds a new SECURITY DEFINER session function `app_current_store_id()` that reads the
  caller's active store from their session, then replaces all permissive RLS policies on
  the five core store-scoped tables with strict store-isolated equivalents.

  ## New Function
  - `app_current_store_id()` — reads x-session-token header, validates against app_sessions,
    returns the user's `active_store_id` from app_users. Returns NULL if session is invalid.

  ## Tables Tightened
  1. **tasks** — SELECT/INSERT/UPDATE/DELETE now require store_id = app_current_store_id()
  2. **incidents** — same pattern
  3. **kundrunda_sessions** — SELECT/INSERT/UPDATE/DELETE scoped to active store
  4. **schedule_imports** — SELECT/INSERT scoped to active store
  5. **schedule_shifts** — scoped via import_id join to schedule_imports.store_id

  ## Child Tables (tasks sub-tables)
  - task_assignees, task_images, task_questions, task_question_answers
    — scoped via task_id -> tasks.store_id = app_current_store_id()

  ## Security Notes
  - All prior overly-permissive policies (USING(true), USING(app_current_user_id() IS NOT NULL))
    are dropped and replaced with store-scoped equivalents
  - Admins bypass store filter via role check so they retain cross-store visibility
  - checklist_templates SELECT policy already scoped via template_stores — not changed here
*/

-- ─────────────────────────────────────────────────────────────
-- 1. app_current_store_id() SECURITY DEFINER function
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.app_current_store_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token   text;
  v_store   uuid;
BEGIN
  BEGIN
    v_token := (current_setting('request.headers', true)::jsonb ->> 'x-session-token');
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;

  IF v_token IS NULL OR v_token = '' THEN
    RETURN NULL;
  END IF;

  SELECT au.active_store_id INTO v_store
  FROM app_sessions s
  JOIN app_users au ON au.id = s.user_id
  WHERE s.token = v_token
    AND s.expires_at > now();

  RETURN v_store;
END;
$$;

GRANT EXECUTE ON FUNCTION public.app_current_store_id() TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 2. TASKS — drop old, add store-scoped policies
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can view tasks" ON tasks;
DROP POLICY IF EXISTS "Session users can insert tasks" ON tasks;
DROP POLICY IF EXISTS "Session users can update tasks" ON tasks;
DROP POLICY IF EXISTS "Session users can delete tasks" ON tasks;

CREATE POLICY "Users can view tasks for active store"
  ON tasks FOR SELECT
  USING (
    app_current_user_id() IS NOT NULL
    AND (
      store_id = app_current_store_id()
      OR app_current_user_role() = 'admin'
    )
  );

CREATE POLICY "Users can insert tasks for active store"
  ON tasks FOR INSERT
  WITH CHECK (
    app_current_user_id() IS NOT NULL
    AND (
      store_id = app_current_store_id()
      OR app_current_user_role() = 'admin'
    )
  );

CREATE POLICY "Users can update tasks for active store"
  ON tasks FOR UPDATE
  USING (
    app_current_user_id() IS NOT NULL
    AND (
      store_id = app_current_store_id()
      OR app_current_user_role() = 'admin'
    )
  )
  WITH CHECK (
    app_current_user_id() IS NOT NULL
    AND (
      store_id = app_current_store_id()
      OR app_current_user_role() = 'admin'
    )
  );

CREATE POLICY "Users can delete tasks for active store"
  ON tasks FOR DELETE
  USING (
    app_current_user_id() IS NOT NULL
    AND (
      store_id = app_current_store_id()
      OR app_current_user_role() = 'admin'
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 3. INCIDENTS — drop old, add store-scoped policies
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can view incidents" ON incidents;
DROP POLICY IF EXISTS "Session users can insert incidents" ON incidents;
DROP POLICY IF EXISTS "Session users can update incidents" ON incidents;
DROP POLICY IF EXISTS "Session users can delete incidents" ON incidents;

CREATE POLICY "Users can view incidents for active store"
  ON incidents FOR SELECT
  USING (
    app_current_user_id() IS NOT NULL
    AND (
      store_id = app_current_store_id()
      OR app_current_user_role() = 'admin'
    )
  );

CREATE POLICY "Users can insert incidents for active store"
  ON incidents FOR INSERT
  WITH CHECK (
    app_current_user_id() IS NOT NULL
    AND (
      store_id = app_current_store_id()
      OR app_current_user_role() = 'admin'
    )
  );

CREATE POLICY "Users can update incidents for active store"
  ON incidents FOR UPDATE
  USING (
    app_current_user_id() IS NOT NULL
    AND (
      store_id = app_current_store_id()
      OR app_current_user_role() = 'admin'
    )
  )
  WITH CHECK (
    app_current_user_id() IS NOT NULL
    AND (
      store_id = app_current_store_id()
      OR app_current_user_role() = 'admin'
    )
  );

CREATE POLICY "Users can delete incidents for active store"
  ON incidents FOR DELETE
  USING (
    app_current_user_id() IS NOT NULL
    AND (
      store_id = app_current_store_id()
      OR app_current_user_role() = 'admin'
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 4. KUNDRUNDA_SESSIONS — drop old, add store-scoped policies
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view sessions for their stores" ON kundrunda_sessions;
DROP POLICY IF EXISTS "Authenticated users can insert sessions" ON kundrunda_sessions;
DROP POLICY IF EXISTS "Session owner or store member can update session" ON kundrunda_sessions;
DROP POLICY IF EXISTS "Session owner or store member can delete session" ON kundrunda_sessions;

CREATE POLICY "Users can view kundrunda sessions for active store"
  ON kundrunda_sessions FOR SELECT
  USING (
    app_current_user_id() IS NOT NULL
    AND (
      store_id = app_current_store_id()
      OR app_current_user_role() = 'admin'
    )
  );

CREATE POLICY "Users can insert kundrunda sessions for active store"
  ON kundrunda_sessions FOR INSERT
  WITH CHECK (
    app_current_user_id() IS NOT NULL
    AND conducted_by = app_current_user_id()
    AND (
      store_id = app_current_store_id()
      OR app_current_user_role() = 'admin'
    )
  );

CREATE POLICY "Users can update kundrunda sessions for active store"
  ON kundrunda_sessions FOR UPDATE
  USING (
    app_current_user_id() IS NOT NULL
    AND (
      store_id = app_current_store_id()
      OR app_current_user_role() = 'admin'
    )
  )
  WITH CHECK (
    app_current_user_id() IS NOT NULL
    AND (
      store_id = app_current_store_id()
      OR app_current_user_role() = 'admin'
    )
  );

CREATE POLICY "Users can delete kundrunda sessions for active store"
  ON kundrunda_sessions FOR DELETE
  USING (
    app_current_user_id() IS NOT NULL
    AND (
      store_id = app_current_store_id()
      OR app_current_user_role() = 'admin'
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 5. SCHEDULE_IMPORTS — drop old, add store-scoped policies
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Valid session can view schedule imports" ON schedule_imports;
DROP POLICY IF EXISTS "Valid session can insert schedule imports" ON schedule_imports;
DROP POLICY IF EXISTS "Valid session can update schedule imports" ON schedule_imports;
DROP POLICY IF EXISTS "Valid session can delete schedule imports" ON schedule_imports;

CREATE POLICY "Users can view schedule imports for active store"
  ON schedule_imports FOR SELECT
  USING (
    app_current_user_id() IS NOT NULL
    AND (
      store_id = app_current_store_id()
      OR app_current_user_role() = 'admin'
    )
  );

CREATE POLICY "Users can insert schedule imports for active store"
  ON schedule_imports FOR INSERT
  WITH CHECK (
    app_current_user_id() IS NOT NULL
    AND (
      store_id = app_current_store_id()
      OR app_current_user_role() = 'admin'
    )
  );

CREATE POLICY "Users can update schedule imports for active store"
  ON schedule_imports FOR UPDATE
  USING (
    app_current_user_id() IS NOT NULL
    AND (
      store_id = app_current_store_id()
      OR app_current_user_role() = 'admin'
    )
  )
  WITH CHECK (
    app_current_user_id() IS NOT NULL
    AND (
      store_id = app_current_store_id()
      OR app_current_user_role() = 'admin'
    )
  );

CREATE POLICY "Users can delete schedule imports for active store"
  ON schedule_imports FOR DELETE
  USING (
    app_current_user_id() IS NOT NULL
    AND (
      store_id = app_current_store_id()
      OR app_current_user_role() = 'admin'
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 6. SCHEDULE_SHIFTS — scope via import_id → schedule_imports
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Valid session can view schedule shifts" ON schedule_shifts;
DROP POLICY IF EXISTS "Valid session can insert schedule shifts" ON schedule_shifts;
DROP POLICY IF EXISTS "Valid session can update schedule shifts" ON schedule_shifts; -- may not exist
DROP POLICY IF EXISTS "Valid session can delete schedule shifts" ON schedule_shifts;

CREATE POLICY "Users can view schedule shifts for active store"
  ON schedule_shifts FOR SELECT
  USING (
    app_current_user_id() IS NOT NULL
    AND (
      import_id IN (
        SELECT id FROM schedule_imports
        WHERE store_id = app_current_store_id()
      )
      OR app_current_user_role() = 'admin'
    )
  );

CREATE POLICY "Users can insert schedule shifts for active store"
  ON schedule_shifts FOR INSERT
  WITH CHECK (
    app_current_user_id() IS NOT NULL
    AND (
      import_id IN (
        SELECT id FROM schedule_imports
        WHERE store_id = app_current_store_id()
      )
      OR app_current_user_role() = 'admin'
    )
  );

CREATE POLICY "Users can update schedule shifts for active store"
  ON schedule_shifts FOR UPDATE
  USING (
    app_current_user_id() IS NOT NULL
    AND (
      import_id IN (
        SELECT id FROM schedule_imports
        WHERE store_id = app_current_store_id()
      )
      OR app_current_user_role() = 'admin'
    )
  )
  WITH CHECK (
    app_current_user_id() IS NOT NULL
    AND (
      import_id IN (
        SELECT id FROM schedule_imports
        WHERE store_id = app_current_store_id()
      )
      OR app_current_user_role() = 'admin'
    )
  );

CREATE POLICY "Users can delete schedule shifts for active store"
  ON schedule_shifts FOR DELETE
  USING (
    app_current_user_id() IS NOT NULL
    AND (
      import_id IN (
        SELECT id FROM schedule_imports
        WHERE store_id = app_current_store_id()
      )
      OR app_current_user_role() = 'admin'
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 7. TASK child tables — scope via task_id join to tasks
-- ─────────────────────────────────────────────────────────────

-- task_assignees
DROP POLICY IF EXISTS "Session users can view task_assignees" ON task_assignees;
DROP POLICY IF EXISTS "Session users can insert task_assignees" ON task_assignees;
DROP POLICY IF EXISTS "Session users can delete task_assignees" ON task_assignees;

CREATE POLICY "Users can view task_assignees for active store"
  ON task_assignees FOR SELECT
  USING (
    app_current_user_id() IS NOT NULL
    AND (
      task_id IN (SELECT id FROM tasks WHERE store_id = app_current_store_id())
      OR app_current_user_role() = 'admin'
    )
  );

CREATE POLICY "Users can insert task_assignees for active store"
  ON task_assignees FOR INSERT
  WITH CHECK (
    app_current_user_id() IS NOT NULL
    AND (
      task_id IN (SELECT id FROM tasks WHERE store_id = app_current_store_id())
      OR app_current_user_role() = 'admin'
    )
  );

CREATE POLICY "Users can delete task_assignees for active store"
  ON task_assignees FOR DELETE
  USING (
    app_current_user_id() IS NOT NULL
    AND (
      task_id IN (SELECT id FROM tasks WHERE store_id = app_current_store_id())
      OR app_current_user_role() = 'admin'
    )
  );

-- task_images
DROP POLICY IF EXISTS "Session users can view task_images" ON task_images;
DROP POLICY IF EXISTS "Session users can insert task_images" ON task_images;
DROP POLICY IF EXISTS "Session users can delete task_images" ON task_images;

CREATE POLICY "Users can view task_images for active store"
  ON task_images FOR SELECT
  USING (
    app_current_user_id() IS NOT NULL
    AND (
      task_id IN (SELECT id FROM tasks WHERE store_id = app_current_store_id())
      OR app_current_user_role() = 'admin'
    )
  );

CREATE POLICY "Users can insert task_images for active store"
  ON task_images FOR INSERT
  WITH CHECK (
    app_current_user_id() IS NOT NULL
    AND (
      task_id IN (SELECT id FROM tasks WHERE store_id = app_current_store_id())
      OR app_current_user_role() = 'admin'
    )
  );

CREATE POLICY "Users can delete task_images for active store"
  ON task_images FOR DELETE
  USING (
    app_current_user_id() IS NOT NULL
    AND (
      task_id IN (SELECT id FROM tasks WHERE store_id = app_current_store_id())
      OR app_current_user_role() = 'admin'
    )
  );

-- task_questions
DROP POLICY IF EXISTS "Session users can view task_questions" ON task_questions;
DROP POLICY IF EXISTS "Session users can insert task_questions" ON task_questions;
DROP POLICY IF EXISTS "Session users can update task_questions" ON task_questions;
DROP POLICY IF EXISTS "Session users can delete task_questions" ON task_questions;

CREATE POLICY "Users can view task_questions for active store"
  ON task_questions FOR SELECT
  USING (
    app_current_user_id() IS NOT NULL
    AND (
      task_id IN (SELECT id FROM tasks WHERE store_id = app_current_store_id())
      OR app_current_user_role() = 'admin'
    )
  );

CREATE POLICY "Users can insert task_questions for active store"
  ON task_questions FOR INSERT
  WITH CHECK (
    app_current_user_id() IS NOT NULL
    AND (
      task_id IN (SELECT id FROM tasks WHERE store_id = app_current_store_id())
      OR app_current_user_role() = 'admin'
    )
  );

CREATE POLICY "Users can update task_questions for active store"
  ON task_questions FOR UPDATE
  USING (
    app_current_user_id() IS NOT NULL
    AND (
      task_id IN (SELECT id FROM tasks WHERE store_id = app_current_store_id())
      OR app_current_user_role() = 'admin'
    )
  )
  WITH CHECK (
    app_current_user_id() IS NOT NULL
    AND (
      task_id IN (SELECT id FROM tasks WHERE store_id = app_current_store_id())
      OR app_current_user_role() = 'admin'
    )
  );

CREATE POLICY "Users can delete task_questions for active store"
  ON task_questions FOR DELETE
  USING (
    app_current_user_id() IS NOT NULL
    AND (
      task_id IN (SELECT id FROM tasks WHERE store_id = app_current_store_id())
      OR app_current_user_role() = 'admin'
    )
  );

-- task_question_answers
DROP POLICY IF EXISTS "Session users can view task_question_answers" ON task_question_answers;
DROP POLICY IF EXISTS "Session users can insert task_question_answers" ON task_question_answers;

CREATE POLICY "Users can view task_question_answers for active store"
  ON task_question_answers FOR SELECT
  USING (
    app_current_user_id() IS NOT NULL
    AND (
      task_id IN (SELECT id FROM tasks WHERE store_id = app_current_store_id())
      OR app_current_user_role() = 'admin'
    )
  );

CREATE POLICY "Users can insert task_question_answers for active store"
  ON task_question_answers FOR INSERT
  WITH CHECK (
    app_current_user_id() IS NOT NULL
    AND (
      task_id IN (SELECT id FROM tasks WHERE store_id = app_current_store_id())
      OR app_current_user_role() = 'admin'
    )
  );
