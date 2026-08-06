/*
  # Fix: permission denied for function app_user_store_ids (and other RLS helpers)

  ## Root cause
  20260730213500_revoke_anon_rpc_permissions.sql changed six RLS helper functions
  to SECURITY INVOKER and revoked EXECUTE from anon, keeping it only for
  "authenticated". That assumes logged-in users run queries as the Postgres
  "authenticated" role.

  Storeflow does not use Supabase Auth JWTs for its own login system — sessions
  are tracked via a custom x-session-token header read inside app_current_user_id()
  (see 20260515172512_make_session_functions_security_definer.sql). Every request
  from the app, logged in or not, is executed by PostgREST as the "anon" Postgres
  role. Revoking anon's EXECUTE grant broke every RLS policy that calls these
  functions — customer_requests, customer_request_images, app_users, delivery_*,
  checklist_templates, etc — causing errors like:
    permission denied for function app_user_store_ids

  Switching to SECURITY INVOKER also reintroduces the RLS-recursion bug that
  20260515172512 explicitly fixed: called from inside a policy on app_sessions /
  app_users, an invoker function has no access to those tables under RLS and
  silently returns NULL instead of the session's user id.

  ## Fix
  Restore SECURITY DEFINER and re-grant EXECUTE to anon (in addition to
  authenticated, which is harmless to keep in case that's used elsewhere).
*/

ALTER FUNCTION public.app_current_store_id() SECURITY DEFINER;
ALTER FUNCTION public.app_current_user_id() SECURITY DEFINER;
ALTER FUNCTION public.app_current_user_role() SECURITY DEFINER;
ALTER FUNCTION public.app_is_admin() SECURITY DEFINER;
ALTER FUNCTION public.app_user_manages_store(uuid) SECURITY DEFINER;
ALTER FUNCTION public.app_user_store_ids() SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.app_current_store_id() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_current_user_id() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_current_user_role() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_is_admin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_user_manages_store(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_user_store_ids() TO anon, authenticated;
