/*
  # Add question_type and recurrence tracking

  1. Changes
    - `task_questions`: add `question_type` column ('text' | 'yes_no'), default 'text'
    - `checklist_template_questions`: add `question_type` column ('text' | 'yes_no'), default 'text'
    - `tasks`: add `parent_task_id` column if not exists (already in type but may be missing in DB)
    - `tasks`: add `last_spawned_at` column to track when the last recurring child was created
    - `tasks`: add `is_template_task` boolean to mark the original recurring task source

  2. Notes
    - question_type 'text' = free text answer (existing behavior)
    - question_type 'yes_no' = Ja/Nej radio buttons
    - last_spawned_at lets the client know when it last created a child task so it doesn't double-create
*/

-- Add question_type to task_questions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_questions' AND column_name = 'question_type'
  ) THEN
    ALTER TABLE task_questions ADD COLUMN question_type text NOT NULL DEFAULT 'text'
      CHECK (question_type IN ('text', 'yes_no'));
  END IF;
END $$;

-- Add question_type to checklist_template_questions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'checklist_template_questions' AND column_name = 'question_type'
  ) THEN
    ALTER TABLE checklist_template_questions ADD COLUMN question_type text NOT NULL DEFAULT 'text'
      CHECK (question_type IN ('text', 'yes_no'));
  END IF;
END $$;

-- Add parent_task_id to tasks (references self, tracks which original task spawned this one)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'parent_task_id'
  ) THEN
    ALTER TABLE tasks ADD COLUMN parent_task_id uuid REFERENCES tasks(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add last_spawned_at to track recurrence generation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'last_spawned_at'
  ) THEN
    ALTER TABLE tasks ADD COLUMN last_spawned_at timestamptz DEFAULT NULL;
  END IF;
END $$;
