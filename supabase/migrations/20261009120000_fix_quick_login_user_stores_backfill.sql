BEGIN;
-- Backfill user_stores från app_users.store_id där det saknas
INSERT INTO user_stores (user_id, store_id, is_primary)
SELECT id, store_id, true
FROM app_users
WHERE store_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM user_stores us WHERE us.user_id = app_users.id
  );

-- Säkerställa att vyn har rätt kolumner för quick-login (store_id ingår redan från fix_lookup_view)
COMMIT;
