begin;

-- Ensure session-based auth can read/write core tables used by the app.
-- These tables already have RLS policies; this only grants the base privileges
-- so anon/authenticated roles can actually reach the policies.

grant select, insert, update, delete on store_product_deliveries to anon, authenticated;
grant select, insert, update, delete on products to anon, authenticated;
grant select, insert, update, delete on store_hidden_categories to anon, authenticated;

commit;