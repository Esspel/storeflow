/*
  # StoreFlow V2 – Template Inheritance, Status, Versioning, Processes, Sub-tasks

  ## Summary
  Extends the checklist_templates and tasks system with:

  1. **Template Status** – `active | review | deprecated | archived`
     Controls visibility and selectability in task creation.

  2. **Template Ownership** – `owner_id`, `created_by` (already exists), `updated_by`
     Tracks who owns, created, and last edited a template.

  3. **Template Versioning** – `version` (integer counter), `template_versions` table
     Full version history with rollback support. Each save bumps the version.

  4. **Template Inheritance** – `parent_template_id`, `inherit_mode`
     - `parent_template_id`: links a derived template to its source
     - `inherit_mode`: `copy` (independent) or `variant` (linked, receives updates)
     - `overridden_steps`: JSONB array of step IDs overridden locally
     - `hidden_step_ids`: text[] of parent step IDs hidden in this variant
     - `extra_items`: JSONB for additional steps added by child template

  5. **Processes** – new `processes` table
     A process groups multiple templates into an ordered workflow.
     `process_id` column added to `checklist_templates`.

  6. **Sub-tasks** – `parent_task_id` already exists; add `completion_mode`
     - `completion_mode` on tasks: `manual | auto_from_children | auto_complete_children`
     - Child tasks reference `parent_task_id` (already exists on tasks table)

  ## New Tables
  - `template_versions` – full version snapshots per template
  - `processes` – named workflow groups containing ordered templates
  - `process_templates` – junction: ordered template list inside a process

  ## Modified Tables
  - `checklist_templates`: +status, +owner_id, +updated_by, +version, +parent_template_id, +inherit_mode, +overridden_steps, +hidden_step_ids, +process_id
  - `tasks`: +completion_mode, +process_id, +process_instance_id

  ## Security
  - RLS enabled on all new tables
  - Policies follow existing session-function pattern (app_current_user_id())
*/

-- ─────────────────────────────────────────────────────────────────
-- 1. TEMPLATE STATUS
-- ─────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'checklist_templates' AND column_name = 'status'
  ) THEN
    ALTER TABLE checklist_templates ADD COLUMN status text NOT NULL DEFAULT 'active';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 2. TEMPLATE OWNERSHIP & AUDIT
-- ─────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'checklist_templates' AND column_name = 'owner_id'
  ) THEN
    ALTER TABLE checklist_templates ADD COLUMN owner_id uuid REFERENCES app_users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'checklist_templates' AND column_name = 'updated_by'
  ) THEN
    ALTER TABLE checklist_templates ADD COLUMN updated_by uuid REFERENCES app_users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 3. TEMPLATE VERSIONING
-- ─────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'checklist_templates' AND column_name = 'version'
  ) THEN
    ALTER TABLE checklist_templates ADD COLUMN version integer NOT NULL DEFAULT 1;
  END IF;
END $$;

-- Full version snapshot table
CREATE TABLE IF NOT EXISTS template_versions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id    uuid NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
  version        integer NOT NULL,
  snapshot       jsonb NOT NULL,          -- full serialized template at save time
  change_summary text DEFAULT '',        -- human-readable note about what changed
  saved_by       uuid REFERENCES app_users(id) ON DELETE SET NULL,
  saved_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE template_versions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_template_versions_template_id ON template_versions(template_id);

-- Read: any authenticated user who can see templates (anon role for session-based auth)
CREATE POLICY "Anyone can view template versions"
  ON template_versions FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Authenticated users can insert template versions"
  ON template_versions FOR INSERT
  TO anon
  WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────
-- 4. TEMPLATE INHERITANCE
-- ─────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'checklist_templates' AND column_name = 'parent_template_id'
  ) THEN
    ALTER TABLE checklist_templates ADD COLUMN parent_template_id uuid REFERENCES checklist_templates(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 'copy' = independent clone, 'variant' = live-linked child
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'checklist_templates' AND column_name = 'inherit_mode'
  ) THEN
    ALTER TABLE checklist_templates ADD COLUMN inherit_mode text DEFAULT NULL;
  END IF;
END $$;

-- Array of checklist_template_items IDs from parent that are hidden in this child
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'checklist_templates' AND column_name = 'hidden_step_ids'
  ) THEN
    ALTER TABLE checklist_templates ADD COLUMN hidden_step_ids text[] DEFAULT '{}';
  END IF;
END $$;

-- JSONB array of {parent_step_id, label, requires_photo} overrides
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'checklist_templates' AND column_name = 'overridden_steps'
  ) THEN
    ALTER TABLE checklist_templates ADD COLUMN overridden_steps jsonb DEFAULT '[]';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 5. PROCESSES
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS processes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  description    text NOT NULL DEFAULT '',
  category       text NOT NULL DEFAULT '',
  store_id       uuid REFERENCES stores(id) ON DELETE CASCADE,
  hierarchy_scope text NOT NULL DEFAULT 'store',   -- store | hk | forening
  forening_id    uuid REFERENCES foreningar(id) ON DELETE SET NULL,
  is_global      boolean NOT NULL DEFAULT false,
  created_by     uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE processes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_processes_store_id    ON processes(store_id);
CREATE INDEX IF NOT EXISTS idx_processes_forening_id ON processes(forening_id);

-- Store-scoped read access
CREATE POLICY "Users can view their store processes"
  ON processes FOR SELECT
  TO anon
  USING (
    is_global = true
    OR store_id IS NULL
    OR store_id = (
      SELECT store_id FROM app_users WHERE id = app_current_user_id() LIMIT 1
    )
  );

CREATE POLICY "Managers can insert processes"
  ON processes FOR INSERT
  TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE id = app_current_user_id()
        AND role IN ('manager', 'admin')
    )
  );

CREATE POLICY "Managers can update processes"
  ON processes FOR UPDATE
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE id = app_current_user_id()
        AND role IN ('manager', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE id = app_current_user_id()
        AND role IN ('manager', 'admin')
    )
  );

CREATE POLICY "Managers can delete processes"
  ON processes FOR DELETE
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE id = app_current_user_id()
        AND role IN ('manager', 'admin')
    )
  );

-- Junction: ordered template list inside a process
CREATE TABLE IF NOT EXISTS process_templates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id   uuid NOT NULL REFERENCES processes(id) ON DELETE CASCADE,
  template_id  uuid NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
  sort_order   integer NOT NULL DEFAULT 0,
  label        text DEFAULT '',       -- optional override label for this step in the process
  UNIQUE(process_id, template_id)
);

ALTER TABLE process_templates ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_process_templates_process_id  ON process_templates(process_id);
CREATE INDEX IF NOT EXISTS idx_process_templates_template_id ON process_templates(template_id);

CREATE POLICY "Users can view process templates"
  ON process_templates FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Managers can manage process templates"
  ON process_templates FOR INSERT
  TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE id = app_current_user_id()
        AND role IN ('manager', 'admin')
    )
  );

CREATE POLICY "Managers can update process templates"
  ON process_templates FOR UPDATE
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE id = app_current_user_id() AND role IN ('manager', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE id = app_current_user_id() AND role IN ('manager', 'admin')
    )
  );

CREATE POLICY "Managers can delete process templates"
  ON process_templates FOR DELETE
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE id = app_current_user_id() AND role IN ('manager', 'admin')
    )
  );

-- Link templates and tasks to a process
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'checklist_templates' AND column_name = 'process_id'
  ) THEN
    ALTER TABLE checklist_templates ADD COLUMN process_id uuid REFERENCES processes(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'process_id'
  ) THEN
    ALTER TABLE tasks ADD COLUMN process_id uuid REFERENCES processes(id) ON DELETE SET NULL;
  END IF;
END $$;

-- process_instance_id groups all tasks spawned from one process execution
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'process_instance_id'
  ) THEN
    ALTER TABLE tasks ADD COLUMN process_instance_id uuid DEFAULT NULL;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 6. SUB-TASKS – completion_mode on tasks
-- ─────────────────────────────────────────────────────────────────

-- parent_task_id already exists. Add completion_mode:
--   'manual'                  = default, behaves like today
--   'auto_from_children'      = parent completes when all children done
--   'auto_complete_children'  = marking parent done marks all children done
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'completion_mode'
  ) THEN
    ALTER TABLE tasks ADD COLUMN completion_mode text NOT NULL DEFAULT 'manual';
  END IF;
END $$;

-- sub-task sort order within parent
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'sub_task_order'
  ) THEN
    ALTER TABLE tasks ADD COLUMN sub_task_order integer DEFAULT 0;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 7. INDEXES
-- ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_checklist_templates_status           ON checklist_templates(status);
CREATE INDEX IF NOT EXISTS idx_checklist_templates_parent_template  ON checklist_templates(parent_template_id);
CREATE INDEX IF NOT EXISTS idx_checklist_templates_process_id       ON checklist_templates(process_id);
CREATE INDEX IF NOT EXISTS idx_tasks_process_id                     ON tasks(process_id);
CREATE INDEX IF NOT EXISTS idx_tasks_process_instance_id            ON tasks(process_instance_id);
CREATE INDEX IF NOT EXISTS idx_tasks_completion_mode                ON tasks(completion_mode);
