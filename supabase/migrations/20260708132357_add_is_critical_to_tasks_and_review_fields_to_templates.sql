-- is_critical on tasks (mirrors checklist_templates.is_critical)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_critical boolean NOT NULL DEFAULT false;

-- event_trigger_user_id on checklist_templates (mirrors tasks.event_trigger_user_id)
ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS event_trigger_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL;

-- review_interval_months on checklist_templates (how often the template must be reviewed)
ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS review_interval_months integer;

-- template_mode: 'batch_only' | 'manual_only' | 'both' (extends current template_type)
ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS template_mode text NOT NULL DEFAULT 'both' 
  CHECK (template_mode IN ('batch_only', 'manual_only', 'both'));

-- Index for review scheduling
CREATE INDEX IF NOT EXISTS idx_checklist_templates_review_interval 
  ON checklist_templates(review_interval_months) WHERE review_interval_months IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_is_critical 
  ON tasks(is_critical) WHERE is_critical = true;
