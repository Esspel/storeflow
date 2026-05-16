/*
  # Block 1a: Performance Indexes for 800-Store Scale

  ## Purpose
  Prepare the database for 800+ parallel store connections and thousands of
  concurrent users during synchronized peak times (e.g. morning meetings at 09:30).
  RLS policies evaluate WHERE conditions on every row scan — without indexes on
  store_id and created_at those scans become full-table scans at scale.

  ## Changes

  ### New Indexes (all idempotent via IF NOT EXISTS)
  All high-traffic tables receive indexes on store_id, created_at, and hot
  filter columns used by RLS policies and common queries.

  ## Tables Covered
  tasks, incidents, incident_comments, kundrunda_sessions, kundrunda_responses,
  schedule_imports, schedule_shifts, schedule_employees, employee_mappings,
  app_sessions, app_users, user_stores, checklist_templates, template_stores,
  user_groups, user_group_members, audit_log
*/

-- ── tasks ─────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tasks_store_id       ON tasks (store_id);
CREATE INDEX IF NOT EXISTS idx_tasks_store_created  ON tasks (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_store_status   ON tasks (store_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_store_due      ON tasks (store_id, due_date) WHERE due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to    ON tasks (assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_parent_id      ON tasks (parent_task_id) WHERE parent_task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_created_at     ON tasks (created_at DESC);

-- ── incidents ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_incidents_store_id      ON incidents (store_id);
CREATE INDEX IF NOT EXISTS idx_incidents_store_created ON incidents (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_store_status  ON incidents (store_id, status);
CREATE INDEX IF NOT EXISTS idx_incidents_created_at    ON incidents (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_reported_by   ON incidents (reported_by) WHERE reported_by IS NOT NULL;

-- ── incident_comments ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ic_incident_id  ON incident_comments (incident_id);
CREATE INDEX IF NOT EXISTS idx_ic_created_at   ON incident_comments (created_at DESC);

-- ── kundrunda_sessions ────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ks_store_id      ON kundrunda_sessions (store_id);
CREATE INDEX IF NOT EXISTS idx_ks_store_created ON kundrunda_sessions (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ks_status        ON kundrunda_sessions (store_id, status);
CREATE INDEX IF NOT EXISTS idx_ks_conducted_by  ON kundrunda_sessions (conducted_by) WHERE conducted_by IS NOT NULL;

-- ── kundrunda_responses ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_kr_session_id    ON kundrunda_responses (session_id);
CREATE INDEX IF NOT EXISTS idx_kr_checkpoint_id ON kundrunda_responses (checkpoint_id);

-- ── schedule_imports ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_si_store_id   ON schedule_imports (store_id);
CREATE INDEX IF NOT EXISTS idx_si_store_week ON schedule_imports (store_id, year DESC, week_number DESC);

-- ── schedule_employees ────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_se_import_id   ON schedule_employees (import_id);
CREATE INDEX IF NOT EXISTS idx_se_employee_nr ON schedule_employees (employee_nr);

-- ── schedule_shifts ───────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ss_import_id   ON schedule_shifts (import_id);
CREATE INDEX IF NOT EXISTS idx_ss_employee_id ON schedule_shifts (schedule_employee_id);
CREATE INDEX IF NOT EXISTS idx_ss_day_date    ON schedule_shifts (day_date);
CREATE INDEX IF NOT EXISTS idx_ss_emp_day     ON schedule_shifts (schedule_employee_id, day_date);

-- ── employee_mappings ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_em_store_id    ON employee_mappings (store_id);
CREATE INDEX IF NOT EXISTS idx_em_app_user_id ON employee_mappings (app_user_id) WHERE app_user_id IS NOT NULL;

-- ── app_sessions ── (token lookup on every authenticated request)
CREATE INDEX IF NOT EXISTS idx_sessions_token      ON app_sessions (token);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id    ON app_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON app_sessions (expires_at);

-- ── app_users ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_app_users_store_id  ON app_users (store_id) WHERE store_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_app_users_username  ON app_users (username);
CREATE INDEX IF NOT EXISTS idx_app_users_is_active ON app_users (is_active) WHERE is_active = true;

-- ── user_stores ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_user_stores_user_id  ON user_stores (user_id);
CREATE INDEX IF NOT EXISTS idx_user_stores_store_id ON user_stores (store_id);

-- ── checklist_templates ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ct_created_at  ON checklist_templates (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ct_created_by  ON checklist_templates (created_by) WHERE created_by IS NOT NULL;

-- ── template_stores ───────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ts_store_id    ON template_stores (store_id);
CREATE INDEX IF NOT EXISTS idx_ts_template_id ON template_stores (template_id);

-- ── user_groups ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ug_store_id ON user_groups (store_id) WHERE store_id IS NOT NULL;

-- ── user_group_members ────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ugm_group_id ON user_group_members (group_id);
CREATE INDEX IF NOT EXISTS idx_ugm_user_id  ON user_group_members (user_id);

-- ── audit_log ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_audit_actor_id   ON audit_log (actor_id) WHERE actor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity     ON audit_log (entity);
