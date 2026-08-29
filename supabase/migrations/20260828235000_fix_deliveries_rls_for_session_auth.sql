begin;

drop policy if exists "deliveries_user_select" on store_product_deliveries;
drop policy if exists "deliveries_manager_insert" on store_product_deliveries;
drop policy if exists "deliveries_manager_update" on store_product_deliveries;
drop policy if exists "deliveries_manager_delete" on store_product_deliveries;

create policy "Session users can view deliveries"
  on store_product_deliveries for select
  to anon, authenticated
  using (
    app_current_user_id() is not null
    and (
      store_id = (select store_id from app_users where id = app_current_user_id())
      or store_id = (select active_store_id from app_users where id = app_current_user_id())
      or exists (select 1 from app_users where id = app_current_user_id() and role = 'admin')
      or app_user_manages_store(store_id)
    )
  );

create policy "Session users can insert deliveries"
  on store_product_deliveries for insert
  to anon, authenticated
  with check (
    app_current_user_id() is not null
    and (
      store_id = (select store_id from app_users where id = app_current_user_id())
      or store_id = (select active_store_id from app_users where id = app_current_user_id())
      or exists (select 1 from app_users where id = app_current_user_id() and role = 'admin')
      or app_user_manages_store(store_id)
    )
  );

create policy "Session users can update deliveries"
  on store_product_deliveries for update
  to anon, authenticated
  using (
    app_current_user_id() is not null
    and (
      store_id = (select store_id from app_users where id = app_current_user_id())
      or store_id = (select active_store_id from app_users where id = app_current_user_id())
      or exists (select 1 from app_users where id = app_current_user_id() and role = 'admin')
      or app_user_manages_store(store_id)
    )
  )
  with check (
    app_current_user_id() is not null
    and (
      store_id = (select store_id from app_users where id = app_current_user_id())
      or store_id = (select active_store_id from app_users where id = app_current_user_id())
      or exists (select 1 from app_users where id = app_current_user_id() and role = 'admin')
      or app_user_manages_store(store_id)
    )
  );

create policy "Session users can delete deliveries"
  on store_product_deliveries for delete
  to anon, authenticated
  using (
    app_current_user_id() is not null
    and (
      store_id = (select store_id from app_users where id = app_current_user_id())
      or store_id = (select active_store_id from app_users where id = app_current_user_id())
      or exists (select 1 from app_users where id = app_current_user_id() and role = 'admin')
      or app_user_manages_store(store_id)
    )
  );

commit;