/*
  # Backfill hierarchy_level from role for existing users

  Users created before hierarchy_level was added have NULL hierarchy_level.
  This migration sets sensible defaults:
  - role = 'admin' → hierarchy_level = 'admin'
  - role = 'manager' → hierarchy_level = 'chef'
  - role = 'employee' (or anything else) → hierarchy_level = 'anvandare'

  Only updates rows where hierarchy_level is currently NULL.
*/

UPDATE app_users
SET hierarchy_level = CASE
  WHEN role = 'admin' THEN 'admin'
  WHEN role = 'manager' THEN 'chef'
  ELSE 'anvandare'
END
WHERE hierarchy_level IS NULL;
