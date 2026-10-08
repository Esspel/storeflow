BEGIN;
DROP VIEW IF EXISTS public.app_users_public_lookup;
CREATE OR REPLACE VIEW public.app_users_public_lookup AS
SELECT
  a.id,
  a.username,
  a.display_name,
  a.role,
  a.hierarchy_level,
  a.active_store_id,
  a.store_id,
  a.is_active,
  a.created_at,
  a.updated_at
FROM public.app_users a
WHERE a.is_active = true;
GRANT SELECT ON public.app_users_public_lookup TO anon, authenticated;
COMMIT;
