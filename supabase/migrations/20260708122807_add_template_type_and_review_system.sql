-- Add template_type: 'regular' (manual task creation) | 'base' (batch/scheduled only)
ALTER TABLE checklist_templates
  ADD COLUMN IF NOT EXISTS template_type text NOT NULL DEFAULT 'regular'
    CHECK (template_type IN ('regular', 'base'));

-- Review system: track when a recurring template was last reviewed and when it's next due
ALTER TABLE checklist_templates
  ADD COLUMN IF NOT EXISTS last_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_review_at  timestamptz,
  ADD COLUMN IF NOT EXISTS is_critical     boolean NOT NULL DEFAULT false;

-- Backfill: templates that already have a recurrence_rule and no end date (or far end date)
-- set their next_review_at to created_at + 24 months so existing templates aren't immediately
-- overdue on deploy.
UPDATE checklist_templates
SET next_review_at = GREATEST(
  created_at + INTERVAL '24 months',
  now() + INTERVAL '1 month'
)
WHERE recurrence_rule IS NOT NULL
  AND next_review_at IS NULL
  AND (recurrence_end IS NULL OR recurrence_end::date > (now() + INTERVAL '18 months')::date);

-- Index for quick review-due lookups
CREATE INDEX IF NOT EXISTS idx_checklist_templates_next_review
  ON checklist_templates(next_review_at)
  WHERE next_review_at IS NOT NULL;
