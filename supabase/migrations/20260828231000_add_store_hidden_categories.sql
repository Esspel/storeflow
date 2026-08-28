begin;

create table store_hidden_categories (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  category text not null,
  is_hidden boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(store_id, category)
);

create index store_hidden_categories_store_id_idx on store_hidden_categories(store_id);

alter table store_hidden_categories enable row level security;

create policy "Store managers and admins can view hidden categories"
  on store_hidden_categories for select
  using (
    exists (
      select 1 from stores
      where stores.id = store_hidden_categories.store_id
        and (
          exists (
            select 1 from app_users
            where app_users.id = auth.uid()
              and app_users.role in ('admin', 'chef')
              and app_users.store_id = stores.id
          )
          or exists (
            select 1 from user_stores us
            where us.user_id = auth.uid()
              and us.store_id = stores.id
          )
        )
    )
  );

create policy "Store managers and admins can upsert hidden categories"
  on store_hidden_categories for insert
  with check (
    exists (
      select 1 from stores
      where stores.id = store_hidden_categories.store_id
        and (
          exists (
            select 1 from app_users
            where app_users.id = auth.uid()
              and app_users.role in ('admin', 'chef')
              and app_users.store_id = stores.id
          )
          or exists (
            select 1 from user_stores us
            where us.user_id = auth.uid()
              and us.store_id = stores.id
          )
        )
    )
  );

create policy "Store managers and admins can update hidden categories"
  on store_hidden_categories for update
  using (
    exists (
      select 1 from stores
      where stores.id = store_hidden_categories.store_id
        and (
          exists (
            select 1 from app_users
            where app_users.id = auth.uid()
              and app_users.role in ('admin', 'chef')
              and app_users.store_id = stores.id
          )
          or exists (
            select 1 from user_stores us
            where us.user_id = auth.uid()
              and us.store_id = stores.id
          )
        )
    )
  );

create policy "Store managers and admins can delete hidden categories"
  on store_hidden_categories for delete
  using (
    exists (
      select 1 from stores
      where stores.id = store_hidden_categories.store_id
        and (
          exists (
            select 1 from app_users
            where app_users.id = auth.uid()
              and app_users.role in ('admin', 'chef')
              and app_users.store_id = stores.id
          )
          or exists (
            select 1 from user_stores us
            where us.user_id = auth.uid()
              and us.store_id = stores.id
          )
        )
    )
  );

commit;