/*
  # Add role_manually_set flag to app_users

  ## Summary
  Adds a boolean column `role_manually_set` to `app_users` to track whether a user's
  role was set manually through the admin UI (vs automatically derived from XML schedule import).

  When `role_manually_set = true`, XML schedule imports will NOT overwrite the user's role.
  When `role_manually_set = false` (default), XML imports may update the role from employee_group.

  ## Changes
  - `app_users.role_manually_set` (boolean, default false) — set to true when admin manually changes a role
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'app_users' AND column_name = 'role_manually_set'
  ) THEN
    ALTER TABLE app_users ADD COLUMN role_manually_set boolean NOT NULL DEFAULT false;
  END IF;
END $$;
