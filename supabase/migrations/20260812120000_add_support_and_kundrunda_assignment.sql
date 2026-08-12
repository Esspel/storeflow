-- Supportärenden (ersätter mejl)
CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  store_id uuid,
  app_version text,
  user_agent text,
  offline_queue_length int DEFAULT 0,
  last_error text,
  idb_usage text,
  message text,
  status text DEFAULT 'open',
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS support_ticket_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid REFERENCES support_tickets(id) ON DELETE CASCADE,
  admin_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  message text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Veckovis kundrunda-tilldelning
CREATE TABLE IF NOT EXISTS kundrunda_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid,
  week_start date NOT NULL,
  day_of_week int NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  assigned_user_id uuid REFERENCES app_users(id) ON DELETE CASCADE,
  created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (store_id, week_start, day_of_week)
);

-- RLS
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_ticket_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE kundrunda_assignments ENABLE ROW LEVEL SECURITY;

-- support_tickets: användare ser sina egna; admin/chef ser alla i sin butik
CREATE POLICY "support_tickets_user_select" ON support_tickets
  FOR SELECT USING (user_id = (SELECT id FROM app_users WHERE id = auth.uid()));

CREATE POLICY "support_tickets_admin_select" ON support_tickets
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role IN ('admin','manager'))
  );

CREATE POLICY "support_tickets_insert" ON support_tickets
  FOR INSERT WITH CHECK (user_id = (SELECT id FROM app_users WHERE id = auth.uid()));

CREATE POLICY "support_tickets_admin_update" ON support_tickets
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role IN ('admin','manager'))
  );

-- replies: admin/chef kan läsa/skriva; användare kan läsa på sina tickets
CREATE POLICY "support_replies_select" ON support_ticket_replies
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role IN ('admin','manager'))
    OR EXISTS (SELECT 1 FROM support_tickets t WHERE t.id = ticket_id AND t.user_id = (SELECT id FROM app_users WHERE id = auth.uid()))
  );

CREATE POLICY "support_replies_admin_insert" ON support_ticket_replies
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role IN ('admin','manager'))
  );

-- kundrunda_assignments: admin/chef hanterar; alla i butiken kan läsa
CREATE POLICY "kundrunda_assignments_select" ON kundrunda_assignments
  FOR SELECT USING (true);

CREATE POLICY "kundrunda_assignments_admin_write" ON kundrunda_assignments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role IN ('admin','manager'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role IN ('admin','manager'))
  );