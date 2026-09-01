/*
  Migration: Replace overly permissive RLS policies (USING true/WITH CHECK true)
  with store-scoped policies using app_current_store_id() for 5 tables.

  Tables fixed:
  - products
  - reclamations
  - product_reclamation_stats
  - spatial_maps
  - store_sections

  Pattern: SELECT allows authenticated users to see their store's data
           INSERT/UPDATE/DELETE requires store_id = app_current_store_id()
           (with admin bypass where appropriate)

  Note: StoreFlow uses x-session-token auth, not Supabase Auth (auth.uid()).
*/

-- ═══════════════════════════════════════════════════════════════════════════════════
-- 1. PRODUCTS - Global master data but scoped to user's stores for mutations
-- ═══════════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "products_user_select" ON products;
DROP POLICY IF EXISTS "products_manager_insert" ON products;
DROP POLICY IF EXISTS "products_manager_update" ON products;

-- SELECT: Allow viewing products from user's assigned stores or active store
CREATE POLICY "Session users can view products"
  ON products FOR SELECT
  TO anon, authenticated
  USING (
    app_current_user_id() IS NOT NULL
    AND (
      store_id = (SELECT store_id FROM app_users WHERE id = app_current_user_id())
      OR store_id = (SELECT active_store_id FROM app_users WHERE id = app_current_user_id())
      OR EXISTS (SELECT 1 FROM app_users WHERE id = app_current_user_id() AND role = 'admin')
      OR app_user_manages_store(store_id)
    )
  );

-- INSERT: Restrict to user's managed stores
CREATE POLICY "Session users can insert products"
  ON products FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    app_current_user_id() IS NOT NULL
    AND (
      store_id = (SELECT store_id FROM app_users WHERE id = app_current_user_id())
      OR store_id = (SELECT active_store_id FROM app_users WHERE id = app_current_user_id())
      OR EXISTS (SELECT 1 FROM app_users WHERE id = app_current_user_id() AND role = 'admin')
      OR app_user_manages_store(store_id)
    )
  );

-- UPDATE: Restrict to user's managed stores
CREATE POLICY "Session users can update products"
  ON products FOR UPDATE
  TO anon, authenticated
  USING (
    app_current_user_id() IS NOT NULL
    AND (
      store_id = (SELECT store_id FROM app_users WHERE id = app_current_user_id())
      OR store_id = (SELECT active_store_id FROM app_users WHERE id = app_current_user_id())
      OR EXISTS (SELECT 1 FROM app_users WHERE id = app_current_user_id() AND role = 'admin')
      OR app_user_manages_store(store_id)
    )
  )
  WITH CHECK (
    app_current_user_id() IS NOT NULL
    AND (
      store_id = (SELECT store_id FROM app_users WHERE id = app_current_user_id())
      OR store_id = (SELECT active_store_id FROM app_users WHERE id = app_current_user_id())
      OR EXISTS (SELECT 1 FROM app_users WHERE id = app_current_user_id() AND role = 'admin')
      OR app_user_manages_store(store_id)
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════════════
-- 2. RECLAMATIONS - Per-store reclamation tracking
-- ══════════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS reclamations_select ON public.reclamations;
DROP POLICY IF EXISTS reclamations_modify ON public.reclamations;

CREATE POLICY "reclamations_session_select"
  ON public.reclamations FOR SELECT
  TO anon, authenticated
  USING (store_id = app_current_store_id());

CREATE POLICY "reclamations_session_insert"
  ON public.reclamations FOR INSERT
  TO anon, authenticated
  WITH CHECK (store_id = app_current_store_id());

CREATE POLICY "reclamations_session_update"
  ON public.reclamations FOR UPDATE
  TO anon, authenticated
  USING (store_id = app_current_store_id())
  WITH CHECK (store_id = app_current_store_id());

CREATE POLICY "reclamations_session_delete"
  ON public.reclamations FOR DELETE
  TO anon, authenticated
  USING (store_id = app_current_store_id());

-- ═══════════════════════════════════════════════════════════════════════════════════
-- 3. PRODUCT_RECLAMATION_STATS - Per-store aggregation
-- ══════════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS prs_select ON public.product_reclamation_stats;
DROP POLICY IF EXISTS prs_modify ON public.product_reclamation_stats;

CREATE POLICY "prs_session_select"
  ON public.product_reclamation_stats FOR SELECT
  TO anon, authenticated
  USING (store_id = app_current_store_id());

CREATE POLICY "prs_session_insert"
  ON public.product_reclamation_stats FOR INSERT
  TO anon, authenticated
  WITH CHECK (store_id = app_current_store_id());

CREATE POLICY "prs_session_update"
  ON public.product_reclamation_stats FOR UPDATE
  TO anon, authenticated
  USING (store_id = app_current_store_id())
  WITH CHECK (store_id = app_current_store_id());

-- ═══════════════════════════════════════════════════════════════════════════════════
-- 4. SPATIAL_MAPS - Per-store spatial mapping
-- ══════════════════════════════════════════════════════════════════════════════════

-- Drop existing policies that may use auth.uid()
DROP POLICY IF EXISTS "spatial_maps_select" ON spatial_maps;
DROP POLICY IF EXISTS "spatial_maps_manage" ON spatial_maps;

CREATE POLICY "spatial_maps_session_select"
  ON spatial_maps FOR SELECT
  TO anon, authenticated
  USING (
    store_id = app_current_store_id()
    OR EXISTS (SELECT 1 FROM app_users WHERE id = app_current_user_id() AND role = 'admin')
  );

CREATE POLICY "spatial_maps_session_manage"
  ON spatial_maps FOR ALL
  TO anon, authenticated
  USING (
    store_id = app_current_store_id()
    OR EXISTS (SELECT 1 FROM app_users WHERE id = app_current_user_id() AND role = 'admin')
  );

-- ═══════════════════════════════════════════════════════════════════════════════════
-- 5. STORE_SECTIONS - Per-store shelf sections
-- ══════════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS store_sections_select ON public.store_sections;
DROP POLICY IF EXISTS store_sections_modify ON public.store_sections;

CREATE POLICY "store_sections_session_select"
  ON public.store_sections FOR SELECT
  TO anon, authenticated
  USING (store_id = app_current_store_id());

CREATE POLICY "store_sections_session_insert"
  ON public.store_sections FOR INSERT
  TO anon, authenticated
  WITH CHECK (store_id = app_current_store_id());

CREATE POLICY "store_sections_session_update"
  ON public.store_sections FOR UPDATE
  TO anon, authenticated
  USING (store_id = app_current_store_id())
  WITH CHECK (store_id = app_current_store_id());

CREATE POLICY "store_sections_session_delete"
  ON public.store_sections FOR DELETE
  TO anon, authenticated
  USING (store_id = app_current_store_id());