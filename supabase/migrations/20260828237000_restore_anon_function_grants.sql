begin;

-- Corrective migration: restore execute permission on app auth helper functions
-- This app uses custom x-session-token auth and makes all PostgREST requests
-- as the anon role. RLS policies call these functions, so anon must be able
-- to execute them. Without this, queries return empty results instead of
-- errors, causing missing categories, deliveries, etc.

grant execute on function public.app_current_user_id() to anon;
grant execute on function public.app_current_user_role() to anon;
grant execute on function public.app_current_store_id() to anon;
grant execute on function public.app_is_admin() to anon;
grant execute on function public.app_user_manages_store(uuid) to anon;
grant execute on function public.app_user_store_ids() to anon;

commit;