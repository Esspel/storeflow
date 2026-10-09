-- Diagnostisk SQL för quick-login (INGEN ÄNDRING — endast SELECT)
SELECT 'user_stores_count' AS check_name, COUNT(*) AS value FROM user_stores
UNION ALL
SELECT 'app_users_with_store_id', COUNT(*) FROM app_users WHERE store_id IS NOT NULL
UNION ALL
SELECT 'app_users_total', COUNT(*) FROM app_users
UNION ALL
SELECT 'app_users_active', COUNT(*) FROM app_users WHERE is_active = true
UNION ALL
SELECT 'public_lookup_rows', COUNT(*) FROM app_users_public_lookup
UNION ALL
SELECT 'stores_total', COUNT(*) FROM stores
UNION ALL
SELECT 'distinct_store_ids_app_users', COUNT(DISTINCT store_id) FROM app_users WHERE store_id IS NOT NULL;
