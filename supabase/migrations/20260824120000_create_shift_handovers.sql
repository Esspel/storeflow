/*
  # Shift Handovers Table

  Stores shift handover records with task snapshots for smooth transitions between shifts.
*/

CREATE TABLE IF NOT EXISTS shift_handovers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES stores(id) ON DELETE CASCADE,
  outgoing_shift_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  incoming_shift_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  -- JSON snapshot of tasks grouped by marker at handover time
  task_snapshots jsonb DEFAULT '[]'::jsonb,
  -- Free-form notes from outgoing shift
  notes text,
  handed_over_at timestamptz DEFAULT now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE shift_handovers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shift_handovers_select" ON shift_handovers
  FOR SELECT USING (
    store_id = (SELECT store_id FROM app_users WHERE id = auth.uid())
    OR store_id = (SELECT active_store_id FROM app_users WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin')
    OR outgoing_shift_id = auth.uid()
    OR incoming_shift_id = auth.uid()
  );

CREATE POLICY "shift_handovers_insert" ON shift_handovers
  FOR INSERT WITH CHECK (
    store_id = (SELECT store_id FROM app_users WHERE id = auth.uid())
    OR store_id = (SELECT active_store_id FROM app_users WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "shift_handovers_update" ON shift_handovers
  FOR UPDATE USING (
    store_id = (SELECT store_id FROM app_users WHERE id = auth.uid())
    OR store_id = (SELECT active_store_id FROM app_users WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin')
    OR incoming_shift_id = auth.uid()
  );

CREATE INDEX IF NOT EXISTS idx_shift_handovers_store ON shift_handovers(store_id, handed_over_at DESC);
CREATE INDEX IF NOT EXISTS idx_shift_handovers_incoming ON shift_handovers(incoming_shift_id, acknowledged_at);

-- Trigger to update updated_at
CREATE TRIGGER update_shift_handovers_updated_at
  BEFORE UPDATE ON shift_handovers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();