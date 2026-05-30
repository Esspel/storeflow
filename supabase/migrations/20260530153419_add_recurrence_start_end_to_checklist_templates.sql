/*
  # Add recurrence_start and recurrence_end to checklist_templates

  1. Changes
    - Adds `recurrence_start` (date) to `checklist_templates` — start date for recurrence window
    - Adds `recurrence_end` (date) to `checklist_templates` — end date for recurrence window (required when recurrence is set)

  2. Notes
    - Both columns are optional at the DB level (nullable) but the application enforces that
      `recurrence_end` must be provided when `recurrence_rule` is set.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'checklist_templates' AND column_name = 'recurrence_start'
  ) THEN
    ALTER TABLE checklist_templates ADD COLUMN recurrence_start date;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'checklist_templates' AND column_name = 'recurrence_end'
  ) THEN
    ALTER TABLE checklist_templates ADD COLUMN recurrence_end date;
  END IF;
END $$;
