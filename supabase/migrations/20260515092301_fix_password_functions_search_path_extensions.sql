/*
  # Fix password functions search_path to include extensions schema

  pgcrypto's crypt() and gen_salt() live in the 'extensions' schema in Supabase.
  The previous migration set search_path = public, pg_catalog which omitted it,
  causing "function crypt(text, text) does not exist" at runtime.

  Fix: add 'extensions' to the search_path on both functions.
  Keeping SECURITY INVOKER since no elevated privileges are needed.
*/

CREATE OR REPLACE FUNCTION public.verify_password(plain_password text, hashed_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, extensions, pg_catalog
AS $$
BEGIN
  RETURN hashed_password = crypt(plain_password, hashed_password);
END;
$$;

CREATE OR REPLACE FUNCTION public.hash_password(plain_password text)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, extensions, pg_catalog
AS $$
BEGIN
  RETURN crypt(plain_password, gen_salt('bf', 10));
END;
$$;
