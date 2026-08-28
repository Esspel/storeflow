begin;

drop policy if exists "Store managers and admins can view hidden categories" on store_hidden_categories;
drop policy if exists "Store managers and admins can upsert hidden categories" on store_hidden_categories;
drop policy if exists "Store managers and admins can update hidden categories" on store_hidden_categories;
drop policy if exists "Store managers and admins can delete hidden categories" on store_hidden_categories;

create policy "Session users can view hidden categories"
  on store_hidden_categories for select
  to anon, authenticated
  using (
    app_current_user_id() is not null
    and (
      exists (
        select 1 from app_users
        where app_users.id = app_current_user_id()
          and app_users.role in ('admin', 'chef')
          and app_users.store_id = store_hidden_categories.store_id
      )
      or exists (
        select 1 from user_stores us
        where us.user_id = app_current_user_id()
          and us.store_id = store_hidden_categories.store_id
      )
      or app_user_manages_store(store_hidden_categories.store_id)
    )
  );

create policy "Session users can insert hidden categories"
  on store_hidden_categories for insert
  to anon, authenticated
  with check (
    app_current_user_id() is not null
    and (
      exists (
        select 1 from app_users
        where app_users.id = app_current_user_id()
          and app_users.role in ('admin', 'chef')
          and app_users.store_id = store_hidden_categories.store_id
      )
      or exists (
        select 1 from user_stores us
        where us.user_id = app_current_user_id()
          and us.store_id = store_hidden_categories.store_id
      )
      or app_user_manages_store(store_hidden_categories.store_id)
    )
  );

create policy "Session users can update hidden categories"
  on store_hidden_categories for update
  to anon, authenticated
  using (
    app_current_user_id() is not null
    and (
      exists (
        select 1 from app_users
        where app_users.id = app_current_user_id()
          and app_users.role in ('admin', 'chef')
          and app_users.store_id = store_hidden_categories.store_id
      )
      or exists (
        select 1 from user_stores us
        where us.user_id = app_current_user_id()
          and us.store_id = store_hidden_categories.store_id
      )
      or app_user_manages_store(store_hidden_categories.store_id)
    )
  )
  with check (
    app_current_user_id() is not null
    and (
      exists (
        select 1 from app_users
        where app_users.id = app_current_user_id()
          and app_users.role in ('admin', 'chef')
          and app_users.store_id = store_hidden_categories.store_id
      )
      or exists (
        select 1 from user_stores us
        where us.user_id = app_current_user_id()
          and us.store_id = store_hidden_categories.store_id
      )
      or app_user_manages_store(store_hidden_categories.store_id)
    )
  );

create policy "Session users can delete hidden categories"
  on store_hidden_categories for delete
  to anon, authenticated
  using (
    app_current_user_id() is not null
    and (
      exists (
        select 1 from app_users
        where app_users.id = app_current_user_id()
          and app_users.role in ('admin', 'chef')
          and app_users.store_id = store_hidden_categories.store_id
      )
      or exists (
        select 1 from user_stores us
        where us.user_id = app_current_user_id()
          and us.store_id = store_hidden_categories.store_id
      )
      or app_user_manages_store(store_hidden_categories.store_id)
    )
  );

commit;