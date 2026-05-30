/*
  # Add due_date_time and due_date_offset to tasks

  ## Summary
  Adds due_date_time (time-of-day string HH:MM) and due_date_offset (days offset from creation)
  to the tasks table so that tasks and templates share the same field set.

  Templates have these fields; tasks were missing them.
  This enables template due_date_time to be applied when spawning tasks from templates.

  ## Changes
  - `tasks`: adds `due_date_time text` — time portion of due date (e.g. "08:00")
  - `tasks`: adds `due_date_offset int` — days until due from creation (used for recurrence)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'due_date_time'
  ) THEN
    ALTER TABLE tasks ADD COLUMN due_date_time text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'due_date_offset'
  ) THEN
    ALTER TABLE tasks ADD COLUMN due_date_offset int;
  END IF;
END $$;
