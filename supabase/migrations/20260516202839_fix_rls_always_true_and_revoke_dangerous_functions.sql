/*
  # Security hardening: Fix always-true RLS policies + restrict function access

  ## Problem
  Several tables have permissive RLS policies with USING(true) or WITH CHECK(true),
  effectively disabling row-level security. Additionally, internal SECURITY DEFINER
  functions (triggers, maintenance) are callable via the REST API.

  ## Changes

  ### 1. delivery_entries — Scope to store membership via plan_id -> delivery_plans.store_id
  ### 2. delivery_plans — Remove duplicate always-true policies (proper store-scoped ones exist)
  ### 3. kundrunda_defect_checkpoints — Restrict INSERT/DELETE to managers/admins
  ### 4. login_attempts — Keep INSERT open with minimal constraint
  ### 5. system_errors — Keep INSERT open with minimal constraint
  ### 6. Storage — Restrict attachments SELECT to authenticated sessions
  ### 7. Functions — Revoke EXECUTE from public/anon on internal functions

  ## Security Impact
  - All delivery data now scoped to store membership
  - Reference data mutations restricted to managers/admins
  - Trigger and maintenance functions no longer callable via REST API
  - Storage listing requires valid session
*/

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. DELIVERY_ENTRIES: Replace always-true with store-membership scoping
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Authenticated can insert delivery entries" ON delivery_entries;
DROP POLICY IF EXISTS "Authenticated can update delivery entries" ON delivery_entries;
DROP POLICY IF EXISTS "Authenticated can delete delivery entries" ON delivery_entries;
DROP POLICY IF EXISTS "Store members can view delivery entries" ON delivery_entries;

CREATE POLICY "Session users in store can view delivery entries"
  ON delivery_entries FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM delivery_plans dp
      WHERE dp.id = delivery_entries.plan_id
      AND dp.store_id IN (SELECT unnest(app_user_store_ids()))
    )
  );

CREATE POLICY "Session users in store can insert delivery entries"
  ON delivery_entries FOR INSERT
  TO anon
  WITH CHECK (
    app_current_user_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM delivery_plans dp
      WHERE dp.id = delivery_entries.plan_id
      AND dp.store_id IN (SELECT unnest(app_user_store_ids()))
    )
  );

CREATE POLICY "Session users in store can update delivery entries"
  ON delivery_entries FOR UPDATE
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM delivery_plans dp
      WHERE dp.id = delivery_entries.plan_id
      AND dp.store_id IN (SELECT unnest(app_user_store_ids()))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM delivery_plans dp
      WHERE dp.id = delivery_entries.plan_id
      AND dp.store_id IN (SELECT unnest(app_user_store_ids()))
    )
  );

CREATE POLICY "Managers and admins can delete delivery entries"
  ON delivery_entries FOR DELETE
  TO anon
  USING (
    app_current_user_role() IN ('manager', 'admin')
    AND EXISTS (
      SELECT 1 FROM delivery_plans dp
      WHERE dp.id = delivery_entries.plan_id
      AND dp.store_id IN (SELECT unnest(app_user_store_ids()))
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. DELIVERY_PLANS: Remove redundant always-true policies
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Authenticated can insert delivery plans" ON delivery_plans;
DROP POLICY IF EXISTS "Authenticated can update delivery plans" ON delivery_plans;
DROP POLICY IF EXISTS "Authenticated can delete delivery plans" ON delivery_plans;
DROP POLICY IF EXISTS "Store members can view delivery plans" ON delivery_plans;

CREATE POLICY "Session users in store can update delivery plans"
  ON delivery_plans FOR UPDATE
  TO anon
  USING (
    app_current_user_id() IS NOT NULL
    AND store_id IN (SELECT unnest(app_user_store_ids()))
  )
  WITH CHECK (
    app_current_user_id() IS NOT NULL
    AND store_id IN (SELECT unnest(app_user_store_ids()))
  );

CREATE POLICY "Managers and admins can delete delivery plans"
  ON delivery_plans FOR DELETE
  TO anon
  USING (
    app_current_user_role() IN ('manager', 'admin')
    AND store_id IN (SELECT unnest(app_user_store_ids()))
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. KUNDRUNDA_DEFECT_CHECKPOINTS: Restrict mutations to managers/admins
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Authenticated users can insert defect checkpoints" ON kundrunda_defect_checkpoints;
DROP POLICY IF EXISTS "Authenticated users can delete defect checkpoints" ON kundrunda_defect_checkpoints;

CREATE POLICY "Managers and admins can insert defect checkpoints"
  ON kundrunda_defect_checkpoints FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    app_current_user_role() IN ('manager', 'admin')
  );

CREATE POLICY "Managers and admins can delete defect checkpoints"
  ON kundrunda_defect_checkpoints FOR DELETE
  TO anon, authenticated
  USING (
    app_current_user_role() IN ('manager', 'admin')
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. LOGIN_ATTEMPTS: Replace always-true with minimal constraint
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Anon can insert login attempts" ON login_attempts;

CREATE POLICY "Anon can insert login attempts"
  ON login_attempts FOR INSERT
  TO anon
  WITH CHECK (
    username IS NOT NULL AND username <> ''
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. SYSTEM_ERRORS: Replace always-true with minimal constraint
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Anyone can insert system_errors" ON system_errors;

CREATE POLICY "Anyone can insert system errors with required fields"
  ON system_errors FOR INSERT
  TO anon
  WITH CHECK (
    error_message IS NOT NULL AND error_message <> ''
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. STORAGE: Restrict attachments SELECT to users with valid session
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Anyone can read attachments" ON storage.objects;

CREATE POLICY "Session users can read attachments"
  ON storage.objects FOR SELECT
  TO public
  USING (
    bucket_id = 'attachments'
    AND app_current_user_id() IS NOT NULL
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- 7. FUNCTIONS: Revoke EXECUTE from public/anon on internal-only functions
-- ═══════════════════════════════════════════════════════════════════════════════

-- Trigger functions (should NEVER be called via RPC — only invoked by triggers)
REVOKE EXECUTE ON FUNCTION public.prevent_role_escalation() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.protect_eric_soderstrom_admin() FROM anon, authenticated, public;

-- Maintenance/cron functions (only called by pg_cron or service_role)
REVOKE EXECUTE ON FUNCTION public.run_data_retention() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.delete_old_notifications() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.sync_store_region_text() FROM anon, authenticated, public;

-- Admin analytics: keep for anon (frontend calls them) but revoke from public role
REVOKE EXECUTE ON FUNCTION public.get_national_stats() FROM public;
REVOKE EXECUTE ON FUNCTION public.get_regional_performance() FROM public;
REVOKE EXECUTE ON FUNCTION public.get_store_performance_by_region(text) FROM public;

-- Helper functions used by RLS: keep for anon (RLS runs as caller), revoke public
REVOKE EXECUTE ON FUNCTION public.app_current_user_id() FROM public;
REVOKE EXECUTE ON FUNCTION public.app_current_user_role() FROM public;
REVOKE EXECUTE ON FUNCTION public.app_current_store_id() FROM public;
REVOKE EXECUTE ON FUNCTION public.app_user_store_ids() FROM public;
REVOKE EXECUTE ON FUNCTION public.app_is_admin() FROM public;
REVOKE EXECUTE ON FUNCTION public.app_user_manages_store(uuid) FROM public;

-- Login functions: keep for anon (login flow), revoke public
REVOKE EXECUTE ON FUNCTION public.hash_password(text) FROM public;
REVOKE EXECUTE ON FUNCTION public.verify_password(text, text) FROM public;
REVOKE EXECUTE ON FUNCTION public.record_failed_login(text) FROM public;
REVOKE EXECUTE ON FUNCTION public.record_successful_login(text) FROM public;
REVOKE EXECUTE ON FUNCTION public.check_account_locked(text) FROM public;
REVOKE EXECUTE ON FUNCTION public.lookup_user_by_barcode(text, uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.verify_quick_pin(uuid, text) FROM public;
