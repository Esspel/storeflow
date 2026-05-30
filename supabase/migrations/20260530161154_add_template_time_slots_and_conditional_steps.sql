/*
  # Add Template Time Slots and Conditional Steps

  ## Changes

  ### 1. checklist_templates table
  - `time_slots` (text[]) — multiple times of day for the template (e.g. ["10:00","12:00","14:00"])
    When set, one task instance is created per time slot per period.

  ### 2. checklist_template_items table
  - `condition_question_id` (uuid, FK to checklist_template_items) — if set, this step only shows
    when the referenced yes/no question has the answer in `condition_answer`
  - `condition_answer` (text) — "Ja" or "Nej" — the answer that triggers this step to be visible

  ### 3. task_steps table
  - `condition_question_id` (uuid, FK to task_questions) — mirrors template conditional
  - `condition_answer` (text) — "Ja" or "Nej"

  ### Security
  - No new tables, RLS unchanged (existing policies cover new columns)
*/

-- Add time_slots to checklist_templates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'checklist_templates' AND column_name = 'time_slots'
  ) THEN
    ALTER TABLE checklist_templates ADD COLUMN time_slots text[] DEFAULT NULL;
  END IF;
END $$;

-- Add conditional step fields to checklist_template_items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'checklist_template_items' AND column_name = 'condition_question_id'
  ) THEN
    ALTER TABLE checklist_template_items ADD COLUMN condition_question_id uuid DEFAULT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'checklist_template_items' AND column_name = 'condition_answer'
  ) THEN
    ALTER TABLE checklist_template_items ADD COLUMN condition_answer text DEFAULT NULL;
  END IF;
END $$;

-- Add conditional step fields to task_steps
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_steps' AND column_name = 'condition_question_id'
  ) THEN
    ALTER TABLE task_steps ADD COLUMN condition_question_id uuid DEFAULT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_steps' AND column_name = 'condition_answer'
  ) THEN
    ALTER TABLE task_steps ADD COLUMN condition_answer text DEFAULT NULL;
  END IF;
END $$;
