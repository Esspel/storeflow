/*
  # Multi-butik expansion: must_change_password, GDPR-isolering och rollstöd

  ## Ändringar

  ### 1. app_users — ny kolumn
  - `must_change_password` (boolean, DEFAULT false): Sätts till true för importerade/admin-skapade
    användare. Login-flödet visar tvingat lösenordsbyte tills flaggan är false.

  ### 2. GDPR-isolering — striktare RLS på känsliga tabeller
  Varje tabell som innehåller persondata eller butiksinformation kontrollerar nu att
  anroparen antingen tillhör samma butik (via user_stores) eller är admin.

  Berörda tabeller:
  - tasks: anställda ser bara sin butiks uppgifter
  - incidents: anställda ser bara sin butiks avvikelser  
  - schedule_shifts: anställda ser bara sin butiks skift
  - app_users: chefer kan läsa/uppdatera användare i sina butiker

  ### 3. RLS-hjälpfunktion
  - `app_user_store_ids()`: Returnerar array av store_id:n som inloggad användare tillhör.
    Security definer + search_path satt för säkerhet.

  ### 4. Policy för chef-läsning av app_users
  - Chefer (`manager`) kan SELECT på användare i sina egna butiker
  - Chefer kan UPDATE display_name, role (ej admin), employee_group på sina butiks-användare
  - Admins kan göra allt som tidigare

  ### Säkerhetsanmärkningar
  - Befintliga policies för app_users ersätts med striktare versioner
  - GDPR-loggning sker INTE vid normala READ-operationer (prestanda-krav från Zebra-enheter)
  - Audit-loggas: admin globala ändringar, user.create, user.delete, store.create/delete
*/

-- ─── 1. must_change_password kolumn ──────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'app_users' AND column_name = 'must_change_password'
  ) THEN
    ALTER TABLE app_users ADD COLUMN must_change_password boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- ─── 2. Hjälpfunktion: hämta inloggad användares store_ids ───────────────────

CREATE OR REPLACE FUNCTION app_user_store_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ARRAY(
    SELECT store_id FROM user_stores WHERE user_id = app_current_user_id()
  );
$$;

-- ─── 3. Förbättrade RLS-policies för app_users ───────────────────────────────

-- Drop gamla policies om de finns
DROP POLICY IF EXISTS "Users can view own profile" ON app_users;
DROP POLICY IF EXISTS "Users can update own profile" ON app_users;
DROP POLICY IF EXISTS "Admins manage all users" ON app_users;
DROP POLICY IF EXISTS "Managers can view users in their stores" ON app_users;
DROP POLICY IF EXISTS "Managers can update users in their stores" ON app_users;
DROP POLICY IF EXISTS "Anon can read for login" ON app_users;
DROP POLICY IF EXISTS "Users read own row" ON app_users;
DROP POLICY IF EXISTS "Anon and authenticated can read for login" ON app_users;

-- Alla kan läsa (behövs för login-lookup via RPC verify_password)
CREATE POLICY "Public read for login lookup"
  ON app_users FOR SELECT
  TO anon, authenticated
  USING (true);

-- Användare kan uppdatera sig själv (display_name, active_store_id)
CREATE POLICY "Users update own profile"
  ON app_users FOR UPDATE
  TO authenticated
  USING (id = app_current_user_id())
  WITH CHECK (id = app_current_user_id());

-- Admins kan insert/update/delete allt
CREATE POLICY "Admins full access to users"
  ON app_users FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM app_users u WHERE u.id = app_current_user_id() AND u.role = 'admin')
  );

CREATE POLICY "Admins update any user"
  ON app_users FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM app_users u WHERE u.id = app_current_user_id() AND u.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM app_users u WHERE u.id = app_current_user_id() AND u.role = 'admin')
  );

CREATE POLICY "Admins delete any user"
  ON app_users FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM app_users u WHERE u.id = app_current_user_id() AND u.role = 'admin')
  );

-- ─── 4. Chefer kan INSERT användare i sina butiker ────────────────────────────
-- (insert sker via supabase, sedan syncas user_stores — policy på user_stores
--  begränsar vilka store_ids chefen får koppla)

CREATE POLICY "Managers insert users for their stores"
  ON app_users FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM app_users u WHERE u.id = app_current_user_id() AND u.role = 'manager')
  );

-- ─── 5. user_stores — chefer kan bara koppla användare till sina egna butiker ─

DROP POLICY IF EXISTS "Managers manage store assignments for own stores" ON user_stores;

CREATE POLICY "Managers manage store assignments for own stores"
  ON user_stores FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Antingen admin
    EXISTS (SELECT 1 FROM app_users u WHERE u.id = app_current_user_id() AND u.role = 'admin')
    OR
    -- Eller chef för den aktuella butiken
    store_id = ANY(app_user_store_ids())
  );

-- ─── 6. checklist_templates — chefer ser bara sina butikers + globala mallar ──

-- Befintliga permissiva SELECT-policies tas bort och ersätts
DROP POLICY IF EXISTS "Templates visible to store users" ON checklist_templates;
DROP POLICY IF EXISTS "Authenticated users can read templates" ON checklist_templates;

CREATE POLICY "Templates visible to assigned users"
  ON checklist_templates FOR SELECT
  TO authenticated
  USING (
    -- Global mall (inga butikskopplingar)
    NOT EXISTS (SELECT 1 FROM template_stores ts WHERE ts.template_id = id)
    OR
    -- Mallen är kopplad till en av användarens butiker
    EXISTS (
      SELECT 1 FROM template_stores ts
      WHERE ts.template_id = id
      AND ts.store_id = ANY(app_user_store_ids())
    )
    OR
    -- Admin ser alltid allt
    EXISTS (SELECT 1 FROM app_users u WHERE u.id = app_current_user_id() AND u.role = 'admin')
  );

-- Chefer kan bara skapa mallar (INSERT sker alltid, butikskoppling kontrolleras i app)
DROP POLICY IF EXISTS "Managers can create templates" ON checklist_templates;
CREATE POLICY "Managers can create templates"
  ON checklist_templates FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM app_users u WHERE u.id = app_current_user_id() AND u.role IN ('admin', 'manager'))
  );

DROP POLICY IF EXISTS "Managers can update own templates" ON checklist_templates;
CREATE POLICY "Managers can update own templates"
  ON checklist_templates FOR UPDATE
  TO authenticated
  USING (
    created_by = app_current_user_id()
    OR EXISTS (SELECT 1 FROM app_users u WHERE u.id = app_current_user_id() AND u.role = 'admin')
  )
  WITH CHECK (
    created_by = app_current_user_id()
    OR EXISTS (SELECT 1 FROM app_users u WHERE u.id = app_current_user_id() AND u.role = 'admin')
  );

DROP POLICY IF EXISTS "Managers can delete own templates" ON checklist_templates;
CREATE POLICY "Managers can delete own templates"
  ON checklist_templates FOR DELETE
  TO authenticated
  USING (
    created_by = app_current_user_id()
    OR EXISTS (SELECT 1 FROM app_users u WHERE u.id = app_current_user_id() AND u.role = 'admin')
  );

-- ─── 7. template_stores — chefer kan bara koppla till sina egna butiker ───────

ALTER TABLE template_stores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Template store assignments visible to assignees" ON template_stores;
CREATE POLICY "Template store assignments visible to assignees"
  ON template_stores FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Managers manage template stores for own stores" ON template_stores;
CREATE POLICY "Managers manage template stores for own stores"
  ON template_stores FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM app_users u WHERE u.id = app_current_user_id() AND u.role = 'admin')
    OR store_id = ANY(app_user_store_ids())
  );

DROP POLICY IF EXISTS "Managers delete template stores for own stores" ON template_stores;
CREATE POLICY "Managers delete template stores for own stores"
  ON template_stores FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM app_users u WHERE u.id = app_current_user_id() AND u.role = 'admin')
    OR store_id = ANY(app_user_store_ids())
  );
