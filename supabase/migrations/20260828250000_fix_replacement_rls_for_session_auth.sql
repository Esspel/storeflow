-- Replace JWT/current_setting policies used by the replacement workflow.
-- StoreFlow authenticates through x-session-token and runs PostgREST requests as anon.

DROP POLICY IF EXISTS "shelf_life_store_isolation" ON product_shelf_life;
CREATE POLICY "shelf_life_session_select"
  ON product_shelf_life FOR SELECT TO anon, authenticated
  USING (app_current_user_id() IS NOT NULL);

DROP POLICY IF EXISTS "shelf_life_insert_for_store" ON product_shelf_life;
CREATE POLICY "shelf_life_session_insert"
  ON product_shelf_life FOR INSERT TO anon, authenticated
  WITH CHECK (app_current_user_id() IS NOT NULL);

DROP POLICY IF EXISTS "shelf_life_update_for_store" ON product_shelf_life;
CREATE POLICY "shelf_life_session_update"
  ON product_shelf_life FOR UPDATE TO anon, authenticated
  USING (app_current_user_id() IS NOT NULL)
  WITH CHECK (app_current_user_id() IS NOT NULL);

DROP POLICY IF EXISTS "reclamation_history_store_isolation" ON product_reclamation_history;
CREATE POLICY "reclamation_history_session_select"
  ON product_reclamation_history FOR SELECT TO anon, authenticated
  USING (store_id::uuid = app_current_store_id());

DROP POLICY IF EXISTS "reclamation_history_insert_for_store" ON product_reclamation_history;
CREATE POLICY "reclamation_history_session_insert"
  ON product_reclamation_history FOR INSERT TO anon, authenticated
  WITH CHECK (store_id::uuid = app_current_store_id());

DROP POLICY IF EXISTS "delivery_log_store_isolation" ON product_delivery_log;
CREATE POLICY "delivery_log_session_select"
  ON product_delivery_log FOR SELECT TO anon, authenticated
  USING (store_id::uuid = app_current_store_id());

DROP POLICY IF EXISTS "delivery_log_insert_for_store" ON product_delivery_log;
CREATE POLICY "delivery_log_session_insert"
  ON product_delivery_log FOR INSERT TO anon, authenticated
  WITH CHECK (store_id::uuid = app_current_store_id());