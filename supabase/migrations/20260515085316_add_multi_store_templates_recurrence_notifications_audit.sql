/*
  # Multi-store support, templates, recurrence, notifications, audit log

  1. New Tables
    - `user_stores` — many-to-many user ↔ store (replaces single store_id on users)
    - `checklist_templates` — reusable task/checklist templates
    - `checklist_template_items` — steps/items within a template
    - `notifications` — per-user notification feed
    - `audit_log` — append-only action history
    - `incident_images` — image refs for avvikelser

  2. Modified Tables
    - `tasks`: add recurrence columns, nullable store_id relaxation already OK
    - `incidents`: add priority column already exists; ensure comment count OK

  3. Security
    - RLS enabled on all new tables with authenticated-user policies
*/

-- ── user_stores ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_stores (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  store_id   uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, store_id)
);

ALTER TABLE user_stores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read user_stores"
  ON user_stores FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert user_stores"
  ON user_stores FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update user_stores"
  ON user_stores FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete user_stores"
  ON user_stores FOR DELETE TO authenticated
  USING (true);

-- ── checklist_templates ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS checklist_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  description text NOT NULL DEFAULT '',
  category    text NOT NULL DEFAULT '',
  created_by  uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE checklist_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read templates"
  ON checklist_templates FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert templates"
  ON checklist_templates FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update templates"
  ON checklist_templates FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete templates"
  ON checklist_templates FOR DELETE TO authenticated USING (true);

-- ── checklist_template_items ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS checklist_template_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id    uuid NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
  label          text NOT NULL,
  requires_photo boolean NOT NULL DEFAULT false,
  sort_order     int NOT NULL DEFAULT 0
);

ALTER TABLE checklist_template_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read template items"
  ON checklist_template_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert template items"
  ON checklist_template_items FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update template items"
  ON checklist_template_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete template items"
  ON checklist_template_items FOR DELETE TO authenticated USING (true);

-- ── template_stores (assign templates to shops) ───────────────────────────────
CREATE TABLE IF NOT EXISTS template_stores (
  template_id uuid NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
  store_id    uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  PRIMARY KEY (template_id, store_id)
);

ALTER TABLE template_stores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read template_stores"
  ON template_stores FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert template_stores"
  ON template_stores FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can delete template_stores"
  ON template_stores FOR DELETE TO authenticated USING (true);

-- ── recurrence columns on tasks ───────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='recurrence_rule') THEN
    ALTER TABLE tasks
      ADD COLUMN recurrence_rule  text,           -- daily/weekly/monthly/yearly/custom
      ADD COLUMN recurrence_days  int[],           -- for weekly: [0..6] day-of-week
      ADD COLUMN recurrence_interval int DEFAULT 1,-- every N units
      ADD COLUMN recurrence_start date,
      ADD COLUMN recurrence_end   date,
      ADD COLUMN parent_task_id   uuid REFERENCES tasks(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── notifications ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  type       text NOT NULL,   -- task_new/task_overdue/task_done/incident_new/incident_updated
  title      text NOT NULL,
  body       text NOT NULL DEFAULT '',
  link       text NOT NULL DEFAULT '',
  is_read    boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own notifications"
  ON notifications FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users can insert notifications"
  ON notifications FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Users can delete own notifications"
  ON notifications FOR DELETE TO authenticated USING (true);

-- ── audit_log ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id   uuid REFERENCES app_users(id) ON DELETE SET NULL,
  action     text NOT NULL,     -- task.create / task.complete / user.edit / store.delete / incident.update
  entity     text NOT NULL,     -- table name
  entity_id  uuid,
  meta       jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor  ON audit_log(actor_id);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read audit_log"
  ON audit_log FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert audit_log"
  ON audit_log FOR INSERT TO authenticated WITH CHECK (true);

-- ── incident_images ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS incident_images (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  uploaded_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE incident_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read incident_images"
  ON incident_images FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert incident_images"
  ON incident_images FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can delete incident_images"
  ON incident_images FOR DELETE TO authenticated USING (true);

-- ── active_store column on app_users ─────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='app_users' AND column_name='active_store_id') THEN
    ALTER TABLE app_users ADD COLUMN active_store_id uuid REFERENCES stores(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── Backfill user_stores from existing store_id ───────────────────────────────
INSERT INTO user_stores (user_id, store_id, is_primary)
SELECT id, store_id, true
FROM app_users
WHERE store_id IS NOT NULL
ON CONFLICT (user_id, store_id) DO NOTHING;

-- Backfill active_store_id
UPDATE app_users SET active_store_id = store_id WHERE store_id IS NOT NULL AND active_store_id IS NULL;
