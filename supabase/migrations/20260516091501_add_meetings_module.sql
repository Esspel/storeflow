/*
  # Meetings Module

  Adds structured meeting management supporting 4 meeting types used in Coop stores.
  Meeting decisions auto-create tasks in the main tasks table.

  ## New Tables

  ### `meetings`
  One row per meeting instance.
  - `id` (uuid, PK)
  - `meeting_type` (text) — "ledningsgrupp" | "saljledare" | "daglig_styrning" | "veckostamning"
  - `title` (text)
  - `store_id` (uuid, nullable, FK → stores)
  - `scheduled_at` (timestamptz)
  - `started_at` (timestamptz, nullable)
  - `ended_at` (timestamptz, nullable)
  - `status` ("scheduled" | "in_progress" | "completed" | "cancelled")
  - `moderator_id` (uuid, nullable, FK → app_users)
  - `notes` (text, nullable)
  - `created_by` (uuid, nullable, FK → app_users)
  - `created_at` (timestamptz)

  ### `meeting_agenda_items`
  Agenda items for a meeting, each with a duration budget.
  - `id` (uuid, PK)
  - `meeting_id` (uuid, FK → meetings)
  - `title` (text)
  - `description` (text, nullable)
  - `duration_minutes` (int)
  - `sort_order` (int)
  - `started_at` (timestamptz, nullable)
  - `completed_at` (timestamptz, nullable)

  ### `meeting_decisions`
  Decisions/action items captured during a meeting.
  Each decision can optionally auto-create a task.
  - `id` (uuid, PK)
  - `meeting_id` (uuid, FK → meetings)
  - `description` (text)
  - `responsible_user_id` (uuid, nullable, FK → app_users)
  - `due_date` (date, nullable)
  - `created_task_id` (uuid, nullable, FK → tasks)
  - `created_by` (uuid, nullable, FK → app_users)
  - `created_at` (timestamptz)

  ## Security
  - RLS enabled on all new tables
  - Authenticated users can read/write meetings for their stores
*/

-- Meetings
CREATE TABLE IF NOT EXISTS meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_type text NOT NULL CHECK (meeting_type IN ('ledningsgrupp', 'saljledare', 'daglig_styrning', 'veckostamning')),
  title text NOT NULL,
  store_id uuid REFERENCES stores(id) ON DELETE SET NULL,
  scheduled_at timestamptz NOT NULL,
  started_at timestamptz,
  ended_at timestamptz,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  moderator_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  notes text,
  created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view meetings for their stores"
  ON meetings FOR SELECT
  TO authenticated
  USING (
    store_id IN (SELECT store_id FROM user_stores WHERE user_id = auth.uid())
    OR created_by = auth.uid()
  );

CREATE POLICY "Authenticated users can insert meetings"
  ON meetings FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Meeting creator can update meeting"
  ON meetings FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Meeting creator can delete meeting"
  ON meetings FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

-- Agenda items
CREATE TABLE IF NOT EXISTS meeting_agenda_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  duration_minutes int NOT NULL DEFAULT 5,
  sort_order int NOT NULL DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE meeting_agenda_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view agenda items for accessible meetings"
  ON meeting_agenda_items FOR SELECT
  TO authenticated
  USING (
    meeting_id IN (
      SELECT id FROM meetings
      WHERE store_id IN (SELECT store_id FROM user_stores WHERE user_id = auth.uid())
      OR created_by = auth.uid()
    )
  );

CREATE POLICY "Authenticated users can insert agenda items"
  ON meeting_agenda_items FOR INSERT
  TO authenticated
  WITH CHECK (
    meeting_id IN (
      SELECT id FROM meetings WHERE created_by = auth.uid()
    )
  );

CREATE POLICY "Authenticated users can update agenda items"
  ON meeting_agenda_items FOR UPDATE
  TO authenticated
  USING (
    meeting_id IN (
      SELECT id FROM meetings WHERE created_by = auth.uid()
      OR store_id IN (SELECT store_id FROM user_stores WHERE user_id = auth.uid())
    )
  )
  WITH CHECK (
    meeting_id IN (
      SELECT id FROM meetings WHERE created_by = auth.uid()
      OR store_id IN (SELECT store_id FROM user_stores WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Meeting creator can delete agenda items"
  ON meeting_agenda_items FOR DELETE
  TO authenticated
  USING (
    meeting_id IN (SELECT id FROM meetings WHERE created_by = auth.uid())
  );

-- Decisions
CREATE TABLE IF NOT EXISTS meeting_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  description text NOT NULL,
  responsible_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  due_date date,
  created_task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
  created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE meeting_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view decisions for accessible meetings"
  ON meeting_decisions FOR SELECT
  TO authenticated
  USING (
    meeting_id IN (
      SELECT id FROM meetings
      WHERE store_id IN (SELECT store_id FROM user_stores WHERE user_id = auth.uid())
      OR created_by = auth.uid()
    )
  );

CREATE POLICY "Authenticated users can insert decisions"
  ON meeting_decisions FOR INSERT
  TO authenticated
  WITH CHECK (
    meeting_id IN (
      SELECT id FROM meetings
      WHERE created_by = auth.uid()
      OR store_id IN (SELECT store_id FROM user_stores WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Decision creator can update decision"
  ON meeting_decisions FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Decision creator can delete decision"
  ON meeting_decisions FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

-- Indexes for common lookups
CREATE INDEX IF NOT EXISTS idx_meetings_store_id ON meetings(store_id);
CREATE INDEX IF NOT EXISTS idx_meetings_scheduled_at ON meetings(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_meeting_decisions_meeting_id ON meeting_decisions(meeting_id);
CREATE INDEX IF NOT EXISTS idx_kundrunda_sessions_store_id ON kundrunda_sessions(store_id);
CREATE INDEX IF NOT EXISTS idx_kundrunda_responses_session_id ON kundrunda_responses(session_id);
