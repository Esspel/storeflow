/*
  # Task Questions, Notification Auto-Delete, Store Cleanup

  1. New Tables
    - `task_questions` - Text questions on tasks (also from templates)
      - id, task_id, label, answer, is_required, sort_order, answered_by, answered_at, created_at
    - `checklist_template_questions` - Questions on templates
      - id, template_id, label, is_required, sort_order

  2. Modified Tables
    - `checklist_template_items` - rename requires_photo behavior kept
    - `task_steps` - already exists
    - `notifications` - add auto-delete via policy

  3. Auto-delete notifications after 3 days via scheduled function placeholder
     (handled in app via query filter + periodic cleanup)

  4. Notification cleanup function
*/

-- Task questions (from template or direct creation)
CREATE TABLE IF NOT EXISTS task_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  label text NOT NULL,
  answer text DEFAULT '',
  is_required boolean DEFAULT false,
  sort_order integer DEFAULT 0,
  answered_by uuid REFERENCES app_users(id),
  answered_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE task_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Session users can view task_questions"
  ON task_questions FOR SELECT TO anon, authenticated
  USING (app_current_user_id() IS NOT NULL);

CREATE POLICY "Session users can insert task_questions"
  ON task_questions FOR INSERT TO anon, authenticated
  WITH CHECK (app_current_user_id() IS NOT NULL);

CREATE POLICY "Session users can update task_questions"
  ON task_questions FOR UPDATE TO anon, authenticated
  USING (app_current_user_id() IS NOT NULL)
  WITH CHECK (app_current_user_id() IS NOT NULL);

CREATE POLICY "Session users can delete task_questions"
  ON task_questions FOR DELETE TO anon, authenticated
  USING (app_current_user_id() IS NOT NULL);

-- Template questions
CREATE TABLE IF NOT EXISTS checklist_template_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
  label text NOT NULL,
  is_required boolean DEFAULT false,
  sort_order integer DEFAULT 0
);

ALTER TABLE checklist_template_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Session users can view template_questions"
  ON checklist_template_questions FOR SELECT TO anon, authenticated
  USING (app_current_user_id() IS NOT NULL);

CREATE POLICY "Session users can insert template_questions"
  ON checklist_template_questions FOR INSERT TO anon, authenticated
  WITH CHECK (app_current_user_id() IS NOT NULL);

CREATE POLICY "Session users can update template_questions"
  ON checklist_template_questions FOR UPDATE TO anon, authenticated
  USING (app_current_user_id() IS NOT NULL)
  WITH CHECK (app_current_user_id() IS NOT NULL);

CREATE POLICY "Session users can delete template_questions"
  ON checklist_template_questions FOR DELETE TO anon, authenticated
  USING (app_current_user_id() IS NOT NULL);

-- Task question audit log entries (separate table for full history)
CREATE TABLE IF NOT EXISTS task_question_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_question_id uuid NOT NULL REFERENCES task_questions(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  answer text NOT NULL DEFAULT '',
  answered_by uuid REFERENCES app_users(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE task_question_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Session users can view task_question_answers"
  ON task_question_answers FOR SELECT TO anon, authenticated
  USING (app_current_user_id() IS NOT NULL);

CREATE POLICY "Session users can insert task_question_answers"
  ON task_question_answers FOR INSERT TO anon, authenticated
  WITH CHECK (app_current_user_id() IS NOT NULL);

-- Cleanup function for notifications older than 3 days
CREATE OR REPLACE FUNCTION delete_old_notifications()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM notifications WHERE created_at < now() - interval '3 days';
$$;

-- Add task status for 'cancelled'
DO $$
BEGIN
  -- task status is text, no enum constraint to worry about
  NULL;
END $$;
