-- RLS Policies for Zip Organization and Reclamation History
-- Created: 2026-08-27

-- Enable RLS for product_shelf_life (if not already enabled)
ALTER TABLE product_shelf_life ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see shelf life data for their store
DROP POLICY IF EXISTS "shelf_life_store_isolation" ON product_shelf_life;
CREATE POLICY "shelf_life_store_isolation"
  ON product_shelf_life
  FOR SELECT
  TO authenticated
  USING (store_id = current_setting('app.current_store_id')::text);

-- Policy: Users can insert shelf life data for their store
DROP POLICY IF EXISTS "shelf_life_insert_for_store" ON product_shelf_life;
CREATE POLICY "shelf_life_insert_for_store"
  ON product_shelf_life
  FOR INSERT
  TO authenticated
  WITH CHECK (store_id = current_setting('app.current_store_id')::text);

-- Policy: Users can update shelf life data for their store
DROP POLICY IF EXISTS "shelf_life_update_for_store" ON product_shelf_life;
CREATE POLICY "shelf_life_update_for_store"
  ON product_shelf_life
  FOR UPDATE
  TO authenticated
  USING (store_id = current_setting('app.current_store_id')::text);

-- Enable RLS for product_reclamation_history
ALTER TABLE product_reclamation_history ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see reclamation history for their store
DROP POLICY IF EXISTS "reclamation_history_store_isolation" ON product_reclamation_history;
CREATE POLICY "reclamation_history_store_isolation"
  ON product_reclamation_history
  FOR SELECT
  TO authenticated
  USING (store_id = current_setting('app.current_store_id')::text);

-- Policy: Users can insert reclamation records for their store
DROP POLICY IF EXISTS "reclamation_history_insert_for_store" ON product_reclamation_history;
CREATE POLICY "reclamation_history_insert_for_store"
  ON product_reclamation_history
  FOR INSERT
  TO authenticated
  WITH CHECK (store_id = current_setting('app.current_store_id')::text);

-- Enable RLS for product_delivery_log
ALTER TABLE product_delivery_log ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see delivery log for their store
DROP POLICY IF EXISTS "delivery_log_store_isolation" ON product_delivery_log;
CREATE POLICY "delivery_log_store_isolation"
  ON product_delivery_log
  FOR SELECT
  TO authenticated
  USING (store_id = current_setting('app.current_store_id')::text);

-- Policy: Users can insert delivery records for their store
DROP POLICY IF EXISTS "delivery_log_insert_for_store" ON product_delivery_log;
CREATE POLICY "delivery_log_insert_for_store"
  ON product_delivery_log
  FOR INSERT
  TO authenticated
  WITH CHECK (store_id = current_setting('app.current_store_id')::text);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_shelf_life_store ON product_shelf_life(store_id);
CREATE INDEX IF NOT EXISTS idx_reclamation_store_sap ON product_reclamation_history(store_id, sap_article_id);
CREATE INDEX IF NOT EXISTS idx_delivery_store_sap ON product_delivery_log(store_id, sap_article_id);
