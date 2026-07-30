-- ============================================================================
-- MIGRATION: Comprehensive Security & Supabase Linter Fixes (Corrected Column)
-- DESCRIPTION: Fixes SECURITY DEFINER views, overly permissive RLS policies,
--              function search paths, unthrottled RPC functions, and table RLS.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. SECURITY DEFINER Views -> Ändra till security_invoker = true
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.app_users_public_lookup CASCADE;

CREATE VIEW public.app_users_public_lookup
WITH (security_invoker = true) AS
SELECT
  id,
  username,
  display_name,
  role,
  hierarchy_level,
  active_store_id,
  is_active,
  created_at,
  updated_at
FROM public.app_users
WHERE is_active = true;

GRANT SELECT ON public.app_users_public_lookup TO anon, authenticated;

ALTER VIEW IF EXISTS public.view_regional_performance SET (security_invoker = true);
ALTER VIEW IF EXISTS public.view_store_performance SET (security_invoker = true);


-- ----------------------------------------------------------------------------
-- 2. Återställ app_users RLS
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view all app_users" ON public.app_users;
DROP POLICY IF EXISTS "Public read for login lookup" ON public.app_users;
DROP POLICY IF EXISTS "Users can view own app_user record" ON public.app_users;
DROP POLICY IF EXISTS "Managers and Admins can view store app_users" ON public.app_users;

CREATE POLICY "Users can view own app_user record"
  ON public.app_users FOR SELECT
  TO anon, authenticated
  USING (id = app_current_user_id());

CREATE POLICY "Managers and Admins can view store app_users"
  ON public.app_users FOR SELECT
  TO anon, authenticated
  USING (
    app_current_user_role() = 'admin'
    OR (
      app_current_user_role() = 'manager'
      AND EXISTS (
        SELECT 1 FROM public.user_stores us
        WHERE us.user_id = app_users.id
          AND us.store_id = ANY(app_user_store_ids())
      )
    )
  );


-- ----------------------------------------------------------------------------
-- 3. Åtgärda Vidöppna RLS-policyer (Korrigerad kolumn: request_id)
-- ----------------------------------------------------------------------------

-- A) customer_request_images
DROP POLICY IF EXISTS "Anon can insert customer request images" ON public.customer_request_images;
DROP POLICY IF EXISTS "Anyone can delete customer request images" ON public.customer_request_images;
DROP POLICY IF EXISTS "Authenticated users can insert customer request images" ON public.customer_request_images;

CREATE POLICY "Users can insert customer request images for their store"
  ON public.customer_request_images FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.customer_requests cr
      WHERE cr.id = customer_request_images.request_id
        AND cr.store_id = ANY(app_user_store_ids())
    )
  );

CREATE POLICY "Users can delete customer request images for their store"
  ON public.customer_request_images FOR DELETE
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.customer_requests cr
      WHERE cr.id = customer_request_images.request_id
        AND cr.store_id = ANY(app_user_store_ids())
    )
  );

-- B) template_versions
DROP POLICY IF EXISTS "Authenticated users can insert template versions" ON public.template_versions;

CREATE POLICY "Admins and Managers can insert template versions"
  ON public.template_versions FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    app_current_user_role() IN ('admin', 'manager')
  );


-- ----------------------------------------------------------------------------
-- 4. Mutable search_path på funktioner
-- ----------------------------------------------------------------------------
ALTER FUNCTION public.delete_old_schedules() SET search_path = public, pg_temp;


-- ----------------------------------------------------------------------------
-- 5. Återkalla direkt RPC Execute för känsliga/administrativa funktioner
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.publish_central_kundrunda(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_central_kundrunda_to_store(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.init_store_local_kundrunda(uuid) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.publish_central_kundrunda(uuid) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.apply_central_kundrunda_to_store(uuid) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.init_store_local_kundrunda(uuid) TO service_role, postgres;


-- ----------------------------------------------------------------------------
-- 6. Tabell med RLS utan policyer (api_keys)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage api_keys" ON public.api_keys;

CREATE POLICY "Admins can manage api_keys"
  ON public.api_keys FOR ALL
  TO anon, authenticated
  USING (app_current_user_role() = 'admin')
  WITH CHECK (app_current_user_role() = 'admin');

COMMIT;
