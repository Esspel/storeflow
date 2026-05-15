/*
  # Revoke PUBLIC execute on password functions

  The REVOKE from anon only removes the explicit anon grant, but Postgres has
  a default PUBLIC grant on functions. We must also revoke from PUBLIC to fully
  prevent the anon role (which inherits PUBLIC) from calling these functions.

  After this migration, only authenticated, service_role, and postgres can call
  hash_password and verify_password.

  Note: The login flow (auth.ts) calls verify_password from the client using the
  anon key before a session exists. We need to either:
  a) Keep anon execute on verify_password for the login flow, OR
  b) Move login to an Edge Function that uses service_role

  Since option b requires a larger refactor, we keep verify_password callable by
  anon for the login flow, but restrict hash_password (only used after login for
  password changes) to authenticated/service_role only.
*/

-- Revoke PUBLIC execute so the default inheritance is removed
REVOKE EXECUTE ON FUNCTION public.hash_password(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.verify_password(text, text) FROM PUBLIC;

-- Re-grant only to the roles that legitimately need it
-- verify_password: anon needs it for the login flow (no session yet)
-- hash_password: only post-login use, restrict to authenticated + service_role
GRANT EXECUTE ON FUNCTION public.verify_password(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hash_password(text) TO authenticated, service_role;
