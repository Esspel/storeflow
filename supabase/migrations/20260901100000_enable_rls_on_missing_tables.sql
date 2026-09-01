/*
  Migration: Enable RLS on tables with existing session policies
  Fixes: policy_exists_rls_disabled (4 tables)
         rls_disabled_in_public (4 tables)
  Note: StoreFlow uses x-session-token auth (not Supabase Auth).
        SECURITY DEFINER helper functions are intentional.
*/

ALTER TABLE IF EXISTS product_delivery_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS product_reclamation_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS product_shelf_life ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS store_product_deliveries ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════════════════════
-- product_delivery_log — session-scoped policies (created in 20260828250000)
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "delivery_log_session_select" ON product_delivery_log;
CREATE POLICY "delivery_log_session_select"
  ON product_delivery_log FOR SELECT TO anon, authenticated
  USING (store_id::uuid = app_current_store_id());

DROP POLICY IF EXISTS "delivery_log_session_insert" ON product_delivery_log;
CREATE POLICY "delivery_log_session_insert"
  ON product_delivery_log FOR INSERT TO anon, authenticated
  WITH CHECK (store_id::uuid = app_current_store_id());

-- ═══════════════════════════════════════════════════════════════════════════════
-- product_reclamation_history — session-scoped policies (created in 20260828250000)
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "reclamation_history_session_select" ON product_reclamation_history;
CREATE POLICY "reclamation_history_session_select"
  ON product_reclamation_history FOR SELECT TO anon, authenticated
  USING (store_id::uuid = app_current_store_id());

DROP POLICY IF EXISTS "reclamation_history_session_insert" ON product_reclamation_history;
CREATE POLICY "reclamation_history_session_insert"
  ON product_reclamation_history FOR INSERT TO anon, authenticated
  WITH CHECK (store_id::uuid = app_current_store_id());

-- ═══════════════════════════════════════════════════════════════════════════════
-- product_shelf_life — session-scoped policies (created in 20260828250000)
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "shelf_life_session_select" ON product_shelf_life;
CREATE POLICY "shelf_life_session_select"
  ON product_shelf_life FOR SELECT TO anon, authenticated
  USING (app_current_user_id() IS NOT NULL);

DROP POLICY IF EXISTS "shelf_life_session_insert" ON product_shelf_life;
CREATE POLICY "shelf_life_session_insert"
  ON product_shelf_life FOR INSERT TO anon, authenticated
  WITH CHECK (app_current_user_id() IS NOT NULL);

DROP POLICY IF EXISTS "shelf_life_session_update" ON product_shelf_life;
CREATE POLICY "shelf_life_session_update"
  ON product_shelf_life FOR UPDATE TO anon, authenticated
  USING (app_current_user_id() IS NOT NULL)
  WITH CHECK (app_current_user_id() IS NOT NULL);

-- ═══════════════════════════════════════════════════════════════════════════════
-- store_product_deliveries — session-scoped policies (created in 20260828235000)
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Session users can delete deliveries" ON store_product_deliveries;
DROP POLICY IF EXISTS "Session users can insert deliveries" ON store_product_deliveries;
DROP POLICY IF EXISTS "Session users can update deliveries" ON store_product_deliveries;
DROP POLICY IF EXISTS "Session users can view deliveries" ON store_product_deliveries;

CREATE POLICY "Session users can view deliveries"
  ON store_product_deliveries FOR SELECT TO anon, authenticated
  USING (store_id = app_current_store_id());

CREATE POLICY "Session users can insert deliveries"
  ON store_product_deliveries FOR INSERT TO anon, authenticated
  WITH CHECK (store_id = app_current_store_id());

CREATE POLICY "Session users can update deliveries"
  ON store_product_deliveries FOR UPDATE TO anon, authenticated
  USING (store_id = app_current_store_id())
  WITH CHECK (store_id = app_current_store_id());

CREATE POLICY "Session users can delete deliveries"
  ON store_product_deliveries FOR DELETE TO anon, authenticated
  USING (store_id = app_current_store_id());
