begin;

-- Corrective migration: restore execute permission on publish_central_kundrunda
-- This app uses custom x-session-token auth, not Supabase auth.
-- RLS + app_current_user_id() checks enforce authorization, so anon role
-- must be allowed to call the function.

grant execute on function public.publish_central_kundrunda(uuid) to anon, authenticated;

commit;