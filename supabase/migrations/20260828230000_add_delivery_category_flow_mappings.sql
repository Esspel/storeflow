-- Admin-managed mapping from delivery-note categories to replacement flows.

CREATE TABLE IF NOT EXISTS delivery_category_flow_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL UNIQUE,
  flow text NOT NULL CHECK (flow IN ('Färsk', 'Torrt', 'Fryst')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE delivery_category_flow_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "delivery_category_flow_mappings_select" ON delivery_category_flow_mappings;
CREATE POLICY "delivery_category_flow_mappings_select"
  ON delivery_category_flow_mappings FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "delivery_category_flow_mappings_admin_insert" ON delivery_category_flow_mappings;
CREATE POLICY "delivery_category_flow_mappings_admin_insert"
  ON delivery_category_flow_mappings FOR INSERT TO public
  WITH CHECK (EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "delivery_category_flow_mappings_admin_update" ON delivery_category_flow_mappings;
CREATE POLICY "delivery_category_flow_mappings_admin_update"
  ON delivery_category_flow_mappings FOR UPDATE TO public
  USING (EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin'));

CREATE INDEX IF NOT EXISTS idx_delivery_category_flow_mappings_category
  ON delivery_category_flow_mappings(category);