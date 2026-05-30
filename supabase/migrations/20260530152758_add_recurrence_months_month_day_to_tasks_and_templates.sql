/*
  # Add recurrence_months and recurrence_month_day fields

  ## Summary
  Adds two new columns to support the quarterly and monthly recurrence options added in the UI:
  - `recurrence_months`: integer array of month numbers (0=Jan ... 11=Dec) for quarterly patterns
  - `recurrence_month_day`: day-of-month (1-31) for monthly/quarterly recurrence

  ## Changes
  - `tasks`: adds `recurrence_months int[]`, `recurrence_month_day int`
  - `checklist_templates`: adds `recurrence_months int[]`, `recurrence_month_day int`

  ## Notes
  - Both columns are nullable (not all tasks/templates use them)
  - No default values needed — null means "not set"
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'recurrence_months'
  ) THEN
    ALTER TABLE tasks ADD COLUMN recurrence_months int[];
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'recurrence_month_day'
  ) THEN
    ALTER TABLE tasks ADD COLUMN recurrence_month_day int;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'checklist_templates' AND column_name = 'recurrence_months'
  ) THEN
    ALTER TABLE checklist_templates ADD COLUMN recurrence_months int[];
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'checklist_templates' AND column_name = 'recurrence_month_day'
  ) THEN
    ALTER TABLE checklist_templates ADD COLUMN recurrence_month_day int;
  END IF;
END $$;
