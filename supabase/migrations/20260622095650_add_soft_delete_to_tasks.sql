-- Soft-delete support for recurring task series.
-- When a template series is deleted/modified, only future unfulfilled instances
-- are purged. Historical completed tasks retain deleted_at = NULL so they remain
-- visible in reports and audit logs.
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

-- Index for efficient querying of non-deleted tasks
CREATE INDEX IF NOT EXISTS idx_tasks_deleted_at ON tasks (deleted_at) WHERE deleted_at IS NULL;
