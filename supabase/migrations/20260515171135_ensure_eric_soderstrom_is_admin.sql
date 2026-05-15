/*
  # Ensure Eric Söderström always has admin role

  Sets the role to 'admin' for Eric Söderström and creates a trigger
  that prevents his role from being changed away from 'admin'.
*/

-- Set his role to admin now (in case it was changed)
UPDATE app_users SET role = 'admin' WHERE display_name = 'Eric Söderström';

-- Trigger function: protect Eric Söderström's admin role
CREATE OR REPLACE FUNCTION protect_eric_soderstrom_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If this update changes role away from admin for Eric Söderström, revert it
  IF OLD.display_name = 'Eric Söderström' AND NEW.role != 'admin' THEN
    NEW.role := 'admin';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_eric_admin ON app_users;
CREATE TRIGGER trg_protect_eric_admin
  BEFORE UPDATE ON app_users
  FOR EACH ROW
  EXECUTE FUNCTION protect_eric_soderstrom_admin();
