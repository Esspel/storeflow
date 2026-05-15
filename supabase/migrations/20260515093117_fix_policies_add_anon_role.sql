/*
  # Add anon role to all RLS policies

  This app uses a custom auth system where all PostgREST requests are made
  via the anon key. The actual authorization is done through the
  app_current_user_id() helper that validates the x-session-token header.

  All policies that were restricted to 'authenticated' only need to also
  include 'anon' since that's the role used by the client.
*/

-- user_stores
DROP POLICY IF EXISTS "Authenticated users can read user_stores" ON user_stores;
CREATE POLICY "Users can read user_stores" ON user_stores FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Admins can insert user_stores" ON user_stores;
CREATE POLICY "Admins can insert user_stores" ON user_stores FOR INSERT TO anon, authenticated WITH CHECK (app_current_user_role() = 'admin');

DROP POLICY IF EXISTS "Admins can update user_stores" ON user_stores;
CREATE POLICY "Admins can update user_stores" ON user_stores FOR UPDATE TO anon, authenticated USING (app_current_user_role() = 'admin') WITH CHECK (app_current_user_role() = 'admin');

DROP POLICY IF EXISTS "Admins can delete user_stores" ON user_stores;
CREATE POLICY "Admins can delete user_stores" ON user_stores FOR DELETE TO anon, authenticated USING (app_current_user_role() = 'admin');

-- checklist_templates
DROP POLICY IF EXISTS "Authenticated users can read templates" ON checklist_templates;
CREATE POLICY "Users can read templates" ON checklist_templates FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Managers can insert templates" ON checklist_templates;
CREATE POLICY "Managers can insert templates" ON checklist_templates FOR INSERT TO anon, authenticated WITH CHECK (app_current_user_role() IN ('admin', 'manager'));

DROP POLICY IF EXISTS "Managers can update templates" ON checklist_templates;
CREATE POLICY "Managers can update templates" ON checklist_templates FOR UPDATE TO anon, authenticated USING (app_current_user_role() IN ('admin', 'manager')) WITH CHECK (app_current_user_role() IN ('admin', 'manager'));

DROP POLICY IF EXISTS "Managers can delete templates" ON checklist_templates;
CREATE POLICY "Managers can delete templates" ON checklist_templates FOR DELETE TO anon, authenticated USING (app_current_user_role() IN ('admin', 'manager'));

-- checklist_template_items
DROP POLICY IF EXISTS "Authenticated users can read template items" ON checklist_template_items;
CREATE POLICY "Users can read template items" ON checklist_template_items FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Managers can insert template items" ON checklist_template_items;
CREATE POLICY "Managers can insert template items" ON checklist_template_items FOR INSERT TO anon, authenticated WITH CHECK (app_current_user_role() IN ('admin', 'manager'));

DROP POLICY IF EXISTS "Managers can update template items" ON checklist_template_items;
CREATE POLICY "Managers can update template items" ON checklist_template_items FOR UPDATE TO anon, authenticated USING (app_current_user_role() IN ('admin', 'manager')) WITH CHECK (app_current_user_role() IN ('admin', 'manager'));

DROP POLICY IF EXISTS "Managers can delete template items" ON checklist_template_items;
CREATE POLICY "Managers can delete template items" ON checklist_template_items FOR DELETE TO anon, authenticated USING (app_current_user_role() IN ('admin', 'manager'));

-- template_stores
DROP POLICY IF EXISTS "Authenticated users can read template_stores" ON template_stores;
CREATE POLICY "Users can read template_stores" ON template_stores FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Managers can insert template_stores" ON template_stores;
CREATE POLICY "Managers can insert template_stores" ON template_stores FOR INSERT TO anon, authenticated WITH CHECK (app_current_user_role() IN ('admin', 'manager'));

DROP POLICY IF EXISTS "Managers can delete template_stores" ON template_stores;
CREATE POLICY "Managers can delete template_stores" ON template_stores FOR DELETE TO anon, authenticated USING (app_current_user_role() IN ('admin', 'manager'));

-- notifications
DROP POLICY IF EXISTS "Users can read own notifications" ON notifications;
CREATE POLICY "Users can read own notifications" ON notifications FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Session users can insert notifications" ON notifications;
CREATE POLICY "Session users can insert notifications" ON notifications FOR INSERT TO anon, authenticated WITH CHECK (app_current_user_id() IS NOT NULL);

DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
CREATE POLICY "Users can update own notifications" ON notifications FOR UPDATE TO anon, authenticated USING (user_id = app_current_user_id()) WITH CHECK (user_id = app_current_user_id());

DROP POLICY IF EXISTS "Users can delete own notifications" ON notifications;
CREATE POLICY "Users can delete own notifications" ON notifications FOR DELETE TO anon, authenticated USING (user_id = app_current_user_id());

-- audit_log
DROP POLICY IF EXISTS "Authenticated users can read audit_log" ON audit_log;
CREATE POLICY "Users can read audit_log" ON audit_log FOR SELECT TO anon, authenticated USING (true);

-- incident_images
DROP POLICY IF EXISTS "Authenticated users can read incident_images" ON incident_images;
CREATE POLICY "Users can read incident_images" ON incident_images FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Session users can insert incident_images" ON incident_images;
CREATE POLICY "Session users can insert incident_images" ON incident_images FOR INSERT TO anon, authenticated WITH CHECK (app_current_user_id() IS NOT NULL);

DROP POLICY IF EXISTS "Session users can delete incident_images" ON incident_images;
CREATE POLICY "Session users can delete incident_images" ON incident_images FOR DELETE TO anon, authenticated USING (app_current_user_id() IS NOT NULL);
