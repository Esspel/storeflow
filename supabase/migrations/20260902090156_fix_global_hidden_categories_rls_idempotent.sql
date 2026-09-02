-- Fix RLS for global_hidden_categories to support session auth (anon + authenticated)
-- and use app_current_user_id() so admin/chef roles work with both Supabase Auth and PIN/QR login.
-- This migration ensures all DROP statements are placed before CREATE statements for idempotency.
-- Version 2: Added DROP IF EXISTS for all policies to allow re-application

begin;

drop policy if exists "Global hidden categories are readable by authenticated users" on global_hidden_categories;
drop policy if exists "Global hidden categories are manageable by admins and chefs" on global_hidden_categories;
drop policy if exists "Session users can view global hidden categories" on global_hidden_categories;
drop policy if exists "Session admins and chefs can insert global hidden categories" on global_hidden_categories;
drop policy if exists "Session admins and chefs can update global hidden categories" on global_hidden_categories;
drop policy if exists "Session admins and chefs can delete global hidden categories" on global_hidden_categories;

create policy "Session users can view global hidden categories"
  on global_hidden_categories for select
  to anon, authenticated
  using (
    app_current_user_id() is not null
    and exists (
      select 1 from app_users
      where app_users.id = app_current_user_id()
        and app_users.role in ('admin', 'chef')
    )
  );

create policy "Session admins and chefs can insert global hidden categories"
  on global_hidden_categories for insert
  to anon, authenticated
  with check (
    app_current_user_id() is not null
    and exists (
      select 1 from app_users
      where app_users.id = app_current_user_id()
        and app_users.role in ('admin', 'chef')
    )
  );

create policy "Session admins and chefs can update global hidden categories"
  on global_hidden_categories for update
  to anon, authenticated
  using (
    app_current_user_id() is not null
    and exists (
      select 1 from app_users
      where app_users.id = app_current_user_id()
        and app_users.role in ('admin', 'chef')
    )
  )
  with check (
    app_current_user_id() is not null
    and exists (
      select 1 from app_users
      where app_users.id = app_current_user_id()
        and app_users.role in ('admin', 'chef')
    )
  );

create policy "Session admins and chefs can delete global hidden categories"
  on global_hidden_categories for delete
  to anon, authenticated
  using (
    app_current_user_id() is not null
    and exists (
      select 1 from app_users
      where app_users.id = app_current_user_id()
        and app_users.role in ('admin', 'chef')
    )
  );

commit;