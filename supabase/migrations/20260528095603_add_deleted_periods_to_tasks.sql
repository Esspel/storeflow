/*
  # Add deleted_periods to tasks

  1. Changes
    - `tasks` table: add `deleted_periods` (text[]) column to store manually-deleted
      recurrence_period_start values for a recurring series. The spawn logic will
      skip any period found in this array, preventing deleted instances from being
      recreated on the next load.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'deleted_periods'
  ) THEN
    ALTER TABLE tasks ADD COLUMN deleted_periods text[] DEFAULT '{}';
  END IF;
END $$;
