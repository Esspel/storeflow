/*
  # Add recurrence_period_start to tasks

  ## Summary
  Adds a `recurrence_period_start` column to the tasks table so recurring child
  tasks store their period-start date explicitly. This replaces the fragile
  reverse-calculation approach (childDue - durationMs) with a direct key that
  is set at spawn time and used for deduplication.

  ## Changes
  - tasks: new nullable column `recurrence_period_start` (date, not timestamptz)
    Only set on child tasks (parent_task_id IS NOT NULL) that were spawned from
    a recurring parent. Null on all existing rows (safe — treated as "unknown").
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'recurrence_period_start'
  ) THEN
    ALTER TABLE tasks ADD COLUMN recurrence_period_start date;
  END IF;
END $$;
