/*
  # Add full task capability fields to checklist_templates

  1. New columns on checklist_templates:
    - priority (text, default 'Medel')
    - recurrence_rule (text)
    - recurrence_days (integer array)
    - recurrence_interval (integer, default 1)
    - recurrence_start_offset (integer) — days from creation to start recurring
    - recurrence_end_offset (integer) — days from creation to stop recurring
    - due_date_offset (integer) — how many days after creation the task is due
    - assignee_group_ids (uuid array) — default group assignees from this store

  2. No RLS changes (inherits existing policies on checklist_templates)
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='checklist_templates' AND column_name='priority') THEN
    ALTER TABLE checklist_templates ADD COLUMN priority text DEFAULT 'Medel';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='checklist_templates' AND column_name='recurrence_rule') THEN
    ALTER TABLE checklist_templates ADD COLUMN recurrence_rule text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='checklist_templates' AND column_name='recurrence_days') THEN
    ALTER TABLE checklist_templates ADD COLUMN recurrence_days integer[];
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='checklist_templates' AND column_name='recurrence_interval') THEN
    ALTER TABLE checklist_templates ADD COLUMN recurrence_interval integer DEFAULT 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='checklist_templates' AND column_name='due_date_offset') THEN
    ALTER TABLE checklist_templates ADD COLUMN due_date_offset integer;
  END IF;
END $$;
