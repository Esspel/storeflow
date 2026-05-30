/*
  # Fix template_packages and template_package_items RLS policies

  The existing policies use auth.uid() which is always NULL in this app's
  custom session system. Replace with app_current_user_id() so authenticated
  app users can insert/update/delete packages.

  Also open SELECT to anon so packages load for all logged-in app users.
*/

-- Drop old policies
DROP POLICY IF EXISTS "Authenticated users can insert template packages" ON template_packages;
DROP POLICY IF EXISTS "Authenticated users can read template packages" ON template_packages;
DROP POLICY IF EXISTS "Creators can delete their packages" ON template_packages;
DROP POLICY IF EXISTS "Creators can update their packages" ON template_packages;

DROP POLICY IF EXISTS "Authenticated users can delete package items" ON template_package_items;
DROP POLICY IF EXISTS "Authenticated users can insert package items" ON template_package_items;
DROP POLICY IF EXISTS "Authenticated users can read package items" ON template_package_items;
DROP POLICY IF EXISTS "Authenticated users can update package items" ON template_package_items;

-- template_packages: any app session user can read; only app session users can write
CREATE POLICY "App users can read template packages"
  ON template_packages FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "App session users can insert template packages"
  ON template_packages FOR INSERT
  TO anon, authenticated
  WITH CHECK (app_current_user_id() IS NOT NULL);

CREATE POLICY "App session users can update template packages"
  ON template_packages FOR UPDATE
  TO anon, authenticated
  USING (app_current_user_id() IS NOT NULL)
  WITH CHECK (app_current_user_id() IS NOT NULL);

CREATE POLICY "App session users can delete template packages"
  ON template_packages FOR DELETE
  TO anon, authenticated
  USING (app_current_user_id() IS NOT NULL);

-- template_package_items: same pattern
CREATE POLICY "App users can read template package items"
  ON template_package_items FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "App session users can insert template package items"
  ON template_package_items FOR INSERT
  TO anon, authenticated
  WITH CHECK (app_current_user_id() IS NOT NULL);

CREATE POLICY "App session users can update template package items"
  ON template_package_items FOR UPDATE
  TO anon, authenticated
  USING (app_current_user_id() IS NOT NULL)
  WITH CHECK (app_current_user_id() IS NOT NULL);

CREATE POLICY "App session users can delete template package items"
  ON template_package_items FOR DELETE
  TO anon, authenticated
  USING (app_current_user_id() IS NOT NULL);
