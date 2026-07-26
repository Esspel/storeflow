/*
  # Fix: tasks DELETE policy only allowed the session's *active* store

  ## Problem
  "Users can delete tasks for active store" (block1b_store_isolation_rls) restricts
  DELETE on tasks to store_id = app_current_store_id() (the single active store on
  the session), OR admin.

  But fetchTasks() in the UI loads tasks across ALL stores a manager has access to
  (userStores) whenever no single store is selected. Managers with more than one
  store therefore see tasks they cannot actually delete: the DELETE silently
  affects 0 rows (RLS filters it, Postgres/PostgREST does not raise an error),
  so the task just reappears after refetch.

  ## Fix
  Allow DELETE on tasks (and their child tables) for any store the user manages,
  matching the same app_user_store_ids() helper already used elsewhere for GDPR
  scoping, not just the single "active" store.
*/

DROP POLICY IF EXISTS "Users can delete tasks for active store" ON tasks;

CREATE POLICY "Users can delete tasks for own stores"
  ON tasks FOR DELETE
  USING (
    app_current_user_id() IS NOT NULL
    AND (
      store_id = app_current_store_id()
      OR store_id = ANY(app_user_store_ids())
      OR app_current_user_role() = 'admin'
    )
  );

-- Child tables follow the same pattern: scoped via task_id -> tasks.store_id,
-- so they inherit the fix automatically once the parent tasks row is deletable.
-- No changes needed for task_assignees / task_images / task_questions policies.