/*
  # Make session helper functions SECURITY DEFINER

  app_current_user_id() and app_current_user_role() are called inside RLS
  policies on many tables. Since they are NOT security definer, they run as
  the calling role (anon). When RLS checks on app_sessions or app_users fire
  recursively inside those function calls, the session context may not be
  available yet, causing the functions to return NULL even when a valid token
  is present in the request header.

  Making them SECURITY DEFINER means they always run as the owner (postgres),
  bypassing RLS on the tables they query internally. This is the standard
  pattern for session-based auth helper functions.
*/

CREATE OR REPLACE FUNCTION app_current_user_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_token text;
  v_user  uuid;
BEGIN
  BEGIN
    v_token := (current_setting('request.headers', true)::jsonb ->> 'x-session-token');
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;

  IF v_token IS NULL OR v_token = '' THEN
    RETURN NULL;
  END IF;

  SELECT user_id INTO v_user
  FROM app_sessions
  WHERE token = v_token
    AND expires_at > now();

  RETURN v_user;
END;
$$;

CREATE OR REPLACE FUNCTION app_current_user_role()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role
  FROM app_users
  WHERE id = app_current_user_id();
  RETURN v_role;
END;
$$;
