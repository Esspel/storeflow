/*
  # Kundrunda (Store Walkthrough) System

  Adds a digital store walkthrough (Kundrunda) system based on Coop's zone-based
  inspection template with 14 zones. Each session captures scores and defects
  per zone, with defects linked to SAP articles and auto-creating tasks.

  ## New Tables

  ### `kundrunda_zones`
  Static zone definitions for the inspection template.
  - `id` (uuid, PK)
  - `name` (text) — zone display name e.g. "Frukt & Grönt"
  - `sort_order` (int) — display ordering
  - `icon` (text, nullable) — optional icon name

  ### `kundrunda_checkpoints`
  Per-zone checkpoint items (e.g. "Skyltning", "Städning", "Belysning").
  - `id` (uuid, PK)
  - `zone_id` (uuid, FK → kundrunda_zones)
  - `label` (text)
  - `sort_order` (int)

  ### `kundrunda_sessions`
  One row per completed/in-progress walkthrough.
  - `id` (uuid, PK)
  - `store_id` (uuid, FK → stores, nullable)
  - `conducted_by` (uuid, FK → app_users, nullable)
  - `started_at` (timestamptz)
  - `completed_at` (timestamptz, nullable)
  - `status` ("in_progress" | "completed")
  - `total_score` (int, default 0) — points accumulated
  - `max_score` (int, default 0)

  ### `kundrunda_responses`
  One row per checkpoint per session. Captures pass/fail and defect details.
  - `id` (uuid, PK)
  - `session_id` (uuid, FK → kundrunda_sessions)
  - `checkpoint_id` (uuid, FK → kundrunda_checkpoints)
  - `zone_id` (uuid, FK → kundrunda_zones)
  - `result` ("ok" | "avvikelse" | null) — null = not yet answered
  - `defect_description` (text, nullable)
  - `action_taken` (text, nullable)
  - `responsible_user_id` (uuid, FK → app_users, nullable)
  - `sap_article_id` (text, nullable)
  - `created_task_id` (uuid, FK → tasks, nullable) — auto-created task
  - `created_at` (timestamptz)

  ## Security
  - RLS enabled on all new tables
  - Zones and checkpoints are readable by all authenticated users
  - Sessions and responses scoped to authenticated users
*/

-- Zones
CREATE TABLE IF NOT EXISTS kundrunda_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  icon text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE kundrunda_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read zones"
  ON kundrunda_zones FOR SELECT
  TO authenticated
  USING (true);

-- Checkpoints
CREATE TABLE IF NOT EXISTS kundrunda_checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id uuid NOT NULL REFERENCES kundrunda_zones(id) ON DELETE CASCADE,
  label text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE kundrunda_checkpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read checkpoints"
  ON kundrunda_checkpoints FOR SELECT
  TO authenticated
  USING (true);

-- Sessions
CREATE TABLE IF NOT EXISTS kundrunda_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES stores(id) ON DELETE SET NULL,
  conducted_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
  total_score int NOT NULL DEFAULT 0,
  max_score int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE kundrunda_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view sessions for their stores"
  ON kundrunda_sessions FOR SELECT
  TO authenticated
  USING (
    conducted_by = auth.uid()
    OR store_id IN (
      SELECT store_id FROM user_stores WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Authenticated users can insert sessions"
  ON kundrunda_sessions FOR INSERT
  TO authenticated
  WITH CHECK (conducted_by = auth.uid());

CREATE POLICY "Session owner can update their session"
  ON kundrunda_sessions FOR UPDATE
  TO authenticated
  USING (conducted_by = auth.uid())
  WITH CHECK (conducted_by = auth.uid());

-- Responses
CREATE TABLE IF NOT EXISTS kundrunda_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES kundrunda_sessions(id) ON DELETE CASCADE,
  checkpoint_id uuid NOT NULL REFERENCES kundrunda_checkpoints(id) ON DELETE CASCADE,
  zone_id uuid NOT NULL REFERENCES kundrunda_zones(id) ON DELETE CASCADE,
  result text CHECK (result IN ('ok', 'avvikelse')),
  defect_description text,
  action_taken text,
  responsible_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  sap_article_id text,
  created_task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (session_id, checkpoint_id)
);

ALTER TABLE kundrunda_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view responses for their sessions"
  ON kundrunda_responses FOR SELECT
  TO authenticated
  USING (
    session_id IN (
      SELECT id FROM kundrunda_sessions
      WHERE conducted_by = auth.uid()
      OR store_id IN (SELECT store_id FROM user_stores WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Authenticated users can insert responses"
  ON kundrunda_responses FOR INSERT
  TO authenticated
  WITH CHECK (
    session_id IN (
      SELECT id FROM kundrunda_sessions WHERE conducted_by = auth.uid()
    )
  );

CREATE POLICY "Authenticated users can update responses in their sessions"
  ON kundrunda_responses FOR UPDATE
  TO authenticated
  USING (
    session_id IN (
      SELECT id FROM kundrunda_sessions WHERE conducted_by = auth.uid()
    )
  )
  WITH CHECK (
    session_id IN (
      SELECT id FROM kundrunda_sessions WHERE conducted_by = auth.uid()
    )
  );

-- Seed the 14 Coop zones
INSERT INTO kundrunda_zones (name, sort_order) VALUES
  ('Parkering',             1),
  ('Entré',                 2),
  ('Frukt & Grönt',         3),
  ('Bröd',                  4),
  ('Mejeri',                5),
  ('Färsk',                 6),
  ('Kolonial',              7),
  ('Frys',                  8),
  ('Nonfood',               9),
  ('Konfektyr',             10),
  ('Kassa',                 11),
  ('Utanför Kassalinjen',   12),
  ('Bakomliggande',         13),
  ('Personalytor',          14)
ON CONFLICT DO NOTHING;

-- Seed standard checkpoints per zone
DO $$
DECLARE
  z RECORD;
  labels text[] := ARRAY['Skyltning', 'Städning', 'Belysning', 'Säljtryck'];
  lbl text;
  idx int;
BEGIN
  FOR z IN SELECT id FROM kundrunda_zones LOOP
    idx := 1;
    FOREACH lbl IN ARRAY labels LOOP
      INSERT INTO kundrunda_checkpoints (zone_id, label, sort_order)
      VALUES (z.id, lbl, idx)
      ON CONFLICT DO NOTHING;
      idx := idx + 1;
    END LOOP;
  END LOOP;
END $$;
