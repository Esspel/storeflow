-- Create global_hidden_categories table for categories hidden across all stores

begin;

create table if not exists global_hidden_categories (
  id uuid primary key default gen_random_uuid(),
  category text not null unique,
  is_hidden boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_global_hidden_categories_category on global_hidden_categories(category);

alter table global_hidden_categories enable row level security;

drop policy if exists "Global hidden categories are readable by authenticated users" on global_hidden_categories;
create policy "Global hidden categories are readable by authenticated users"
  on global_hidden_categories for select
  to authenticated
  using (true);

drop policy if exists "Global hidden categories are manageable by admins and chefs" on global_hidden_categories;
create policy "Global hidden categories are manageable by admins and chefs"
  on global_hidden_categories for all
  to authenticated
  using (
    exists (
      select 1 from app_users
      where app_users.id = auth.uid()
        and app_users.role in ('admin', 'chef')
    )
  )
  with check (
    exists (
      select 1 from app_users
      where app_users.id = auth.uid()
        and app_users.role in ('admin', 'chef')
    )
  );

comment on table global_hidden_categories is 'Categories hidden from all stores globally';

commit;
