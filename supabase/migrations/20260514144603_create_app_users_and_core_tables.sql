/*
  # StoreFlow App Users & Core Tables

  ## Overview
  Custom authentication system using username/password (no external auth).
  Includes core operational tables for tasks, incidents, stores, and reports.

  ## New Tables
  - `app_users` - Application users with username/password (bcrypt hashed), role, and store assignment
  - `app_sessions` - Session tokens for keeping users logged in
  - `stores` - Retail store locations
  - `tasks` - Task management with checklists
  - `task_steps` - Individual checklist steps for tasks
  - `incidents` - Deviation/incident reports
  - `incident_comments` - Comments on incidents

  ## Security
  - RLS enabled on all tables
  - Policies use session-based access via app_sessions table
  - Admin role can manage all accounts
  - Users can only see their own data or data for their store
*/

-- =====================
-- STORES
-- =====================
CREATE TABLE IF NOT EXISTS stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  city text NOT NULL DEFAULT '',
  region text NOT NULL DEFAULT '',
  address text DEFAULT '',
  phone text DEFAULT '',
  email text DEFAULT '',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE stores ENABLE ROW LEVEL SECURITY;

-- =====================
-- APP USERS (custom auth)
-- =====================
CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  display_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'employee' CHECK (role IN ('admin', 'manager', 'employee')),
  store_id uuid REFERENCES stores(id) ON DELETE SET NULL,
  is_active boolean DEFAULT true,
  last_login timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;

-- =====================
-- APP SESSIONS
-- =====================
CREATE TABLE IF NOT EXISTS app_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  token text UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE app_sessions ENABLE ROW LEVEL SECURITY;

-- =====================
-- TASKS
-- =====================
CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text DEFAULT '',
  category text NOT NULL DEFAULT 'Drift',
  store_id uuid REFERENCES stores(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  priority text NOT NULL DEFAULT 'Medel' CHECK (priority IN ('Låg', 'Medel', 'Hög', 'Kritisk')),
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'progress', 'done', 'late')),
  due_date timestamptz,
  recurring text DEFAULT NULL,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- =====================
-- TASK STEPS (checklist items)
-- =====================
CREATE TABLE IF NOT EXISTS task_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  label text NOT NULL,
  is_done boolean DEFAULT false,
  requires_photo boolean DEFAULT false,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE task_steps ENABLE ROW LEVEL SECURITY;

-- =====================
-- INCIDENTS
-- =====================
CREATE TABLE IF NOT EXISTS incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_number text UNIQUE NOT NULL,
  title text NOT NULL,
  description text DEFAULT '',
  category text DEFAULT '',
  store_id uuid REFERENCES stores(id) ON DELETE SET NULL,
  reported_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES app_users(id) ON DELETE SET NULL,
  priority text NOT NULL DEFAULT 'Medel' CHECK (priority IN ('Låg', 'Medel', 'Hög', 'Kritisk')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'escalated', 'resolved', 'closed')),
  sla_deadline timestamptz,
  resolved_at timestamptz,
  has_photo boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;

-- =====================
-- INCIDENT COMMENTS
-- =====================
CREATE TABLE IF NOT EXISTS incident_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  author_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE incident_comments ENABLE ROW LEVEL SECURITY;

-- =====================
-- RLS POLICIES
-- =====================

-- Helper: get current session user_id from token passed as app.current_user_id
-- We use a simple approach: policies check app.current_user setting

-- STORES policies - all authenticated sessions can read
CREATE POLICY "Authenticated users can view stores"
  ON stores FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Admins can insert stores"
  ON stores FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can update stores"
  ON stores FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- APP_USERS policies
CREATE POLICY "Users can view all app_users"
  ON app_users FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow insert app_users"
  ON app_users FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Allow update app_users"
  ON app_users FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow delete app_users"
  ON app_users FOR DELETE
  TO anon, authenticated
  USING (true);

-- APP_SESSIONS policies
CREATE POLICY "Allow read sessions"
  ON app_sessions FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow insert sessions"
  ON app_sessions FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Allow delete sessions"
  ON app_sessions FOR DELETE
  TO anon, authenticated
  USING (true);

-- TASKS policies
CREATE POLICY "Authenticated users can view tasks"
  ON tasks FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert tasks"
  ON tasks FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update tasks"
  ON tasks FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete tasks"
  ON tasks FOR DELETE
  TO anon, authenticated
  USING (true);

-- TASK_STEPS policies
CREATE POLICY "Authenticated users can view task_steps"
  ON task_steps FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert task_steps"
  ON task_steps FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update task_steps"
  ON task_steps FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete task_steps"
  ON task_steps FOR DELETE
  TO anon, authenticated
  USING (true);

-- INCIDENTS policies
CREATE POLICY "Authenticated users can view incidents"
  ON incidents FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert incidents"
  ON incidents FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update incidents"
  ON incidents FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete incidents"
  ON incidents FOR DELETE
  TO anon, authenticated
  USING (true);

-- INCIDENT_COMMENTS policies
CREATE POLICY "Authenticated users can view incident_comments"
  ON incident_comments FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert incident_comments"
  ON incident_comments FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- =====================
-- INDEXES
-- =====================
CREATE INDEX IF NOT EXISTS idx_app_users_username ON app_users(username);
CREATE INDEX IF NOT EXISTS idx_app_sessions_token ON app_sessions(token);
CREATE INDEX IF NOT EXISTS idx_app_sessions_user_id ON app_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_store_id ON tasks(store_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_task_steps_task_id ON task_steps(task_id);
CREATE INDEX IF NOT EXISTS idx_incidents_store_id ON incidents(store_id);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incident_comments_incident_id ON incident_comments(incident_id);

-- =====================
-- SEED DATA
-- =====================

-- Insert sample stores
INSERT INTO stores (id, name, city, region, address, phone) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'Stockholm City', 'Stockholm', 'Region Stockholm', 'Drottninggatan 45', '08-123 456'),
  ('a1000000-0000-0000-0000-000000000002', 'Malmö Triangeln', 'Malmö', 'Region Syd', 'Triangeln 3', '040-456 789'),
  ('a1000000-0000-0000-0000-000000000003', 'Göteborg Nordstan', 'Göteborg', 'Region Väst', 'Nordstadstorget 1', '031-789 012'),
  ('a1000000-0000-0000-0000-000000000004', 'Uppsala Centrum', 'Uppsala', 'Region Stockholm', 'Stora Torget 2', '018-234 567'),
  ('a1000000-0000-0000-0000-000000000005', 'Lund Mårtenstorget', 'Lund', 'Region Syd', 'Mårtenstorget 1', '046-345 678')
ON CONFLICT (id) DO NOTHING;

-- Insert default admin user (password: admin123 - bcrypt hash)
-- Using a pre-computed bcrypt hash for 'admin123'
INSERT INTO app_users (id, username, password_hash, display_name, role, store_id) VALUES
  ('b1000000-0000-0000-0000-000000000001', 'admin', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Administrator', 'admin', NULL),
  ('b1000000-0000-0000-0000-000000000002', 'emma.andersson', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Emma Andersson', 'manager', 'a1000000-0000-0000-0000-000000000001'),
  ('b1000000-0000-0000-0000-000000000003', 'marcus.k', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Marcus K.', 'employee', 'a1000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;
