-- StoreFlow uses x-session-token authentication, so RLS must use the session helpers.

DROP POLICY IF EXISTS "delivery_category_flow_mappings_admin_insert"
  ON delivery_category_flow_mappings;
CREATE POLICY "delivery_category_flow_mappings_admin_insert"
  ON delivery_category_flow_mappings FOR INSERT TO public
  WITH CHECK (app_current_user_role() = 'admin');

DROP POLICY IF EXISTS "delivery_category_flow_mappings_admin_update"
  ON delivery_category_flow_mappings;
CREATE POLICY "delivery_category_flow_mappings_admin_update"
  ON delivery_category_flow_mappings FOR UPDATE TO public
  USING (app_current_user_role() = 'admin')
  WITH CHECK (app_current_user_role() = 'admin');