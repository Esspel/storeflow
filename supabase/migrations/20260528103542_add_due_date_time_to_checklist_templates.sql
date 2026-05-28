/*
  # Add due_date_time to checklist_templates

  1. Changes
    - `checklist_templates`: add `due_date_time` (text, format HH:MM) column
      allowing templates to specify a time-of-day for the due date, e.g. "08:00".
      This is combined with due_date_offset when spawning tasks.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'checklist_templates' AND column_name = 'due_date_time'
  ) THEN
    ALTER TABLE checklist_templates ADD COLUMN due_date_time text DEFAULT NULL;
  END IF;
END $$;
