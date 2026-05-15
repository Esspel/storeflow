/*
  # Grant anon execute on hash_password

  The app uses the anon key for all PostgREST requests (custom auth system).
  hash_password needs to be callable by anon since password changes happen
  via the anon-key client after app-level session validation.
*/

GRANT EXECUTE ON FUNCTION public.hash_password(text) TO anon;
