CREATE TABLE IF NOT EXISTS reclamations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  sap_article_id text NOT NULL,
  status text CHECK (status IN ('Ej skickad', 'Granskas av butikssupporten', 'Löst', 'Nekad')) DEFAULT 'Ej skickad',
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reclamations_store ON reclamations(store_id);
ALTER TABLE reclamations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reclamations_select" ON reclamations FOR SELECT USING (store_id = (SELECT active_store_id FROM app_users WHERE id = auth.uid()));
CREATE POLICY "reclamations_manage" ON reclamations FOR ALL USING (store_id = (SELECT active_store_id FROM app_users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin'));
