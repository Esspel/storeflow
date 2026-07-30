--------------------------------------------------------------------------------
-- 1. HJÄLPFUNKTIONER FÖR RLS: Byt till SECURITY INVOKER
--------------------------------------------------------------------------------
alter function public.app_current_store_id() security invoker;
alter function public.app_current_user_id() security invoker;
alter function public.app_current_user_role() security invoker;
alter function public.app_is_admin() security invoker;
alter function public.app_user_manages_store(uuid) security invoker;
alter function public.app_user_store_ids() security invoker;

-- Dra in publika rättigheter och ge endast till autentiserade användare
revoke execute on function public.app_current_store_id() from public, anon;
revoke execute on function public.app_current_user_id() from public, anon;
revoke execute on function public.app_current_user_role() from public, anon;
revoke execute on function public.app_is_admin() from public, anon;
revoke execute on function public.app_user_manages_store(uuid) from public, anon;
revoke execute on function public.app_user_store_ids() from public, anon;

grant execute on function public.app_current_store_id() to authenticated;
grant execute on function public.app_current_user_id() to authenticated;
grant execute on function public.app_current_user_role() to authenticated;
grant execute on function public.app_is_admin() to authenticated;
grant execute on function public.app_user_manages_store(uuid) to authenticated;
grant execute on function public.app_user_store_ids() to authenticated;


--------------------------------------------------------------------------------
-- 2. KUNDRUNDA & KÄNSLIGA OPERATIONER: Lås helt till service_role / backend
--------------------------------------------------------------------------------
revoke execute on function public.apply_central_kundrunda_to_store(uuid) from public, anon, authenticated;
revoke execute on function public.init_store_local_kundrunda(uuid) from public, anon, authenticated;
revoke execute on function public.publish_central_kundrunda(uuid) from public, anon, authenticated;

grant execute on function public.apply_central_kundrunda_to_store(uuid) to service_role;
grant execute on function public.init_store_local_kundrunda(uuid) to service_role;
grant execute on function public.publish_central_kundrunda(uuid) to service_role;


--------------------------------------------------------------------------------
-- 3. ANVÄNDARFUNKTIONER (RPC): Behåll SECURITY DEFINER, spärra anon
--------------------------------------------------------------------------------
revoke execute on function public.change_user_password(uuid, text) from public, anon;
revoke execute on function public.update_user_credentials(uuid, text, text, boolean, boolean) from public, anon;

grant execute on function public.change_user_password(uuid, text) to authenticated;
grant execute on function public.update_user_credentials(uuid, text, text, boolean, boolean) to authenticated;


--------------------------------------------------------------------------------
-- 4. STATISTIKFUNKTIONER: Spärra anonym åtkomst, tillåt inloggade
--------------------------------------------------------------------------------
revoke execute on function public.get_national_stats() from public, anon;
revoke execute on function public.get_regional_performance() from public, anon;
revoke execute on function public.get_store_performance_by_region(text) from public, anon;

grant execute on function public.get_national_stats() to authenticated;
grant execute on function public.get_regional_performance() to authenticated;
grant execute on function public.get_store_performance_by_region(text) to authenticated;
