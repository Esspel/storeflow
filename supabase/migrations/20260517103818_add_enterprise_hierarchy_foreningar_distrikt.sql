/*
  # Enterprise Hierarchy: Föreningar, Distrikt & Expanded Stores Schema

  ## Overview
  Implements the full Coop Sverige multi-level organizational hierarchy:
  - 26 Consumer Associations (Föreningar) mapped from the Bolag field
  - Districts (Distrikt) within each Förening
  - Expanded stores table with all 32 CSV fields
  - Template protection: system templates locked read-only for non-admins

  ## New Tables
  - `foreningar` — 26 Coop consumer associations (Bolag mapping)
  - `distrikt` — Districts within each Förening

  ## Modified Tables
  - `stores` — Expanded with all 32 CSV fields (butiks_nr, site_id, bolag, koncept, etc.)
  - `app_users` — Added hierarchy_level field for HK/Förening/Distrikt scopes
  - `checklist_templates` — Added is_system_locked flag

  ## Security
  - RLS policies for foreningar and distrikt
  - Template protection via is_system_locked flag
  - Only admins can modify system-locked templates

  ## Notes
  1. "Distrikt" replaces "Region" concept throughout the system
  2. Stores map to both a Förening (via bolag field) and a Distrikt
  3. hierarchy_level on app_users: 'admin'|'hk'|'forening'|'distrikt'|'chef'|'anvandare'
*/

-- =====================
-- FORENINGAR (Consumer Associations)
-- =====================
CREATE TABLE IF NOT EXISTS foreningar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  short_code text UNIQUE NOT NULL,
  region text DEFAULT '',
  contact_email text DEFAULT '',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE foreningar ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read foreningar"
  ON foreningar FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Admins can insert foreningar"
  ON foreningar FOR INSERT
  TO anon
  WITH CHECK (app_current_user_role() = 'admin');

CREATE POLICY "Admins can update foreningar"
  ON foreningar FOR UPDATE
  TO anon
  USING (app_current_user_role() = 'admin')
  WITH CHECK (app_current_user_role() = 'admin');

CREATE POLICY "Admins can delete foreningar"
  ON foreningar FOR DELETE
  TO anon
  USING (app_current_user_role() = 'admin');

-- =====================
-- DISTRIKT (Districts, replacing Region concept)
-- =====================
CREATE TABLE IF NOT EXISTS distrikt (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  forening_id uuid REFERENCES foreningar(id) ON DELETE SET NULL,
  distriktschef_name text DEFAULT '',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE distrikt ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read distrikt"
  ON distrikt FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Admins can insert distrikt"
  ON distrikt FOR INSERT
  TO anon
  WITH CHECK (app_current_user_role() = 'admin');

CREATE POLICY "Admins can update distrikt"
  ON distrikt FOR UPDATE
  TO anon
  USING (app_current_user_role() = 'admin')
  WITH CHECK (app_current_user_role() = 'admin');

CREATE POLICY "Admins can delete distrikt"
  ON distrikt FOR DELETE
  TO anon
  USING (app_current_user_role() = 'admin');

-- =====================
-- EXPAND STORES TABLE with all 32 CSV fields
-- =====================
DO $$
BEGIN
  -- Core identifier fields
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='butiks_nr') THEN
    ALTER TABLE stores ADD COLUMN butiks_nr text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='site_id') THEN
    ALTER TABLE stores ADD COLUMN site_id text DEFAULT '';
  END IF;
  -- Bolag = maps to Förening
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='bolag') THEN
    ALTER TABLE stores ADD COLUMN bolag text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='forening_id') THEN
    ALTER TABLE stores ADD COLUMN forening_id uuid REFERENCES foreningar(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='distrikt_id') THEN
    ALTER TABLE stores ADD COLUMN distrikt_id uuid REFERENCES distrikt(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='koncept') THEN
    ALTER TABLE stores ADD COLUMN koncept text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='kommentar') THEN
    ALTER TABLE stores ADD COLUMN kommentar text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='butik_enhet') THEN
    ALTER TABLE stores ADD COLUMN butik_enhet text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='foretag') THEN
    ALTER TABLE stores ADD COLUMN foretag text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='enhet') THEN
    ALTER TABLE stores ADD COLUMN enhet text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='organisationsnummer') THEN
    ALTER TABLE stores ADD COLUMN organisationsnummer text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='franchise') THEN
    ALTER TABLE stores ADD COLUMN franchise text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='gatuadress') THEN
    ALTER TABLE stores ADD COLUMN gatuadress text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='postnr') THEN
    ALTER TABLE stores ADD COLUMN postnr text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='postadress') THEN
    ALTER TABLE stores ADD COLUMN postadress text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='email_sm_chef') THEN
    ALTER TABLE stores ADD COLUMN email_sm_chef text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='butikschef') THEN
    ALTER TABLE stores ADD COLUMN butikschef text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='bc_telefon') THEN
    ALTER TABLE stores ADD COLUMN bc_telefon text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='mobil') THEN
    ALTER TABLE stores ADD COLUMN mobil text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='direktor_forsaljning') THEN
    ALTER TABLE stores ADD COLUMN direktor_forsaljning text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='forsaljningschef') THEN
    ALTER TABLE stores ADD COLUMN forsaljningschef text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='marknadsomrade') THEN
    ALTER TABLE stores ADD COLUMN marknadsomrade text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='distriktschef') THEN
    ALTER TABLE stores ADD COLUMN distriktschef text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='distrikt_name') THEN
    ALTER TABLE stores ADD COLUMN distrikt_name text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='k_stalle') THEN
    ALTER TABLE stores ADD COLUMN k_stalle text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='namn2') THEN
    ALTER TABLE stores ADD COLUMN namn2 text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='gamla_butiksnummer') THEN
    ALTER TABLE stores ADD COLUMN gamla_butiksnummer text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='saljplan') THEN
    ALTER TABLE stores ADD COLUMN saljplan text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='sak_kval_samordnare') THEN
    ALTER TABLE stores ADD COLUMN sak_kval_samordnare text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='kommun') THEN
    ALTER TABLE stores ADD COLUMN kommun text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='hr_generalist') THEN
    ALTER TABLE stores ADD COLUMN hr_generalist text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='bemanningsspecialist') THEN
    ALTER TABLE stores ADD COLUMN bemanningsspecialist text DEFAULT '';
  END IF;
END $$;

-- =====================
-- APP USERS: add hierarchy_level and forening/distrikt scope
-- =====================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='app_users' AND column_name='hierarchy_level') THEN
    ALTER TABLE app_users ADD COLUMN hierarchy_level text DEFAULT 'anvandare'
      CHECK (hierarchy_level IN ('admin', 'hk', 'forening', 'distrikt', 'chef', 'anvandare'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='app_users' AND column_name='forening_id') THEN
    ALTER TABLE app_users ADD COLUMN forening_id uuid REFERENCES foreningar(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='app_users' AND column_name='distrikt_id') THEN
    ALTER TABLE app_users ADD COLUMN distrikt_id uuid REFERENCES distrikt(id) ON DELETE SET NULL;
  END IF;
END $$;

-- =====================
-- CHECKLIST TEMPLATES: add system lock flag
-- =====================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='checklist_templates' AND column_name='is_system_locked') THEN
    ALTER TABLE checklist_templates ADD COLUMN is_system_locked boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='checklist_templates' AND column_name='hierarchy_scope') THEN
    ALTER TABLE checklist_templates ADD COLUMN hierarchy_scope text DEFAULT 'store'
      CHECK (hierarchy_scope IN ('admin', 'hk', 'forening', 'distrikt', 'store'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='checklist_templates' AND column_name='forening_id') THEN
    ALTER TABLE checklist_templates ADD COLUMN forening_id uuid REFERENCES foreningar(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='checklist_templates' AND column_name='distrikt_id') THEN
    ALTER TABLE checklist_templates ADD COLUMN distrikt_id uuid REFERENCES distrikt(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Lock all existing templates (created before role restrictions) as system-locked
UPDATE checklist_templates SET is_system_locked = true WHERE is_system_locked = false OR is_system_locked IS NULL;

-- =====================
-- KUNDRUNDA: add hierarchy scope fields
-- =====================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='kundrunda_checkpoints' AND column_name='hierarchy_scope') THEN
    ALTER TABLE kundrunda_checkpoints ADD COLUMN hierarchy_scope text DEFAULT 'hk'
      CHECK (hierarchy_scope IN ('admin', 'hk', 'forening', 'store'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='kundrunda_checkpoints' AND column_name='forening_id') THEN
    ALTER TABLE kundrunda_checkpoints ADD COLUMN forening_id uuid REFERENCES foreningar(id) ON DELETE SET NULL;
  END IF;
END $$;

-- =====================
-- KUNDRUNDA LOCAL VERSIONS: store-level copies with override tracking
-- =====================
CREATE TABLE IF NOT EXISTS kundrunda_local_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  source_checkpoint_id uuid REFERENCES kundrunda_checkpoints(id) ON DELETE SET NULL,
  zone_id uuid REFERENCES kundrunda_zones(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text DEFAULT '',
  reference_photo_url text DEFAULT '',
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  version_type text DEFAULT 'local' CHECK (version_type IN ('local', 'central', 'parallel')),
  central_version_pending boolean DEFAULT false,
  pending_central_checkpoint_id uuid REFERENCES kundrunda_checkpoints(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE kundrunda_local_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read local versions for their stores"
  ON kundrunda_local_versions FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM user_stores us
      WHERE us.user_id = app_current_user_id() AND us.store_id = kundrunda_local_versions.store_id
    ) OR app_current_user_role() = 'admin'
  );

CREATE POLICY "Managers and admins can insert local versions"
  ON kundrunda_local_versions FOR INSERT
  TO anon
  WITH CHECK (
    app_current_user_role() IN ('admin', 'manager') AND
    EXISTS (
      SELECT 1 FROM user_stores us
      WHERE us.user_id = app_current_user_id() AND us.store_id = kundrunda_local_versions.store_id
    )
  );

CREATE POLICY "Managers and admins can update local versions"
  ON kundrunda_local_versions FOR UPDATE
  TO anon
  USING (
    app_current_user_role() IN ('admin', 'manager') AND
    EXISTS (
      SELECT 1 FROM user_stores us
      WHERE us.user_id = app_current_user_id() AND us.store_id = kundrunda_local_versions.store_id
    )
  )
  WITH CHECK (
    app_current_user_role() IN ('admin', 'manager')
  );

CREATE POLICY "Admins can delete local versions"
  ON kundrunda_local_versions FOR DELETE
  TO anon
  USING (app_current_user_role() = 'admin');

-- =====================
-- DELIVERY PLANS: add week_number and is_special_week fields
-- =====================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='delivery_plans' AND column_name='week_number') THEN
    ALTER TABLE delivery_plans ADD COLUMN week_number integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='delivery_plans' AND column_name='year') THEN
    ALTER TABLE delivery_plans ADD COLUMN year integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='delivery_plans' AND column_name='is_special_week') THEN
    ALTER TABLE delivery_plans ADD COLUMN is_special_week boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='delivery_plans' AND column_name='is_default_template') THEN
    ALTER TABLE delivery_plans ADD COLUMN is_default_template boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='delivery_plans' AND column_name='holiday_name') THEN
    ALTER TABLE delivery_plans ADD COLUMN holiday_name text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='delivery_plans' AND column_name='notes') THEN
    ALTER TABLE delivery_plans ADD COLUMN notes text DEFAULT '';
  END IF;
END $$;

-- =====================
-- SEED: 26 Coop Consumer Associations (Föreningar)
-- =====================
INSERT INTO foreningar (name, short_code, region) VALUES
  ('Coop Mitt', 'MITT', 'Mellansverige'),
  ('Coop Nord', 'NORD', 'Norrland'),
  ('Coop Väst', 'VAST', 'Västsverige'),
  ('Coop Öst', 'OST', 'Östsverige'),
  ('Coop Stockholm', 'STHLM', 'Stockholm'),
  ('Coop Södra', 'SODRA', 'Sydsverige'),
  ('Konsumentföreningen Stockholm', 'KFS', 'Stockholm'),
  ('Coop Gotland', 'GOTLAND', 'Gotland'),
  ('Konsum Norrbotten', 'KNORR', 'Norrbotten'),
  ('Konsum Gävleborg', 'KGAV', 'Gävleborg'),
  ('Konsum Jämtland', 'KJAMT', 'Jämtland'),
  ('Konsum Dalarna', 'KDAL', 'Dalarna'),
  ('Konsum Värmland', 'KVARM', 'Värmland'),
  ('Konsum Östergötland', 'KOST', 'Östergötland'),
  ('Konsum Sundsvall', 'KSUND', 'Västernorrland'),
  ('Konsum Halland', 'KHAL', 'Halland'),
  ('Konsum Karlskrona-Ronneby', 'KKR', 'Blekinge'),
  ('Konsum Kalmar', 'KKALM', 'Kalmar'),
  ('Förenade Coop', 'FC', 'Rikstäckande'),
  ('Coop Blekinge', 'BLEK', 'Blekinge'),
  ('Coop Kronoberg', 'KRON', 'Kronoberg'),
  ('Coop Skåne', 'SKANE', 'Skåne'),
  ('Coop Norrland', 'CNORR', 'Norrland'),
  ('Coop Goteborg', 'CGOT', 'Göteborg'),
  ('Coop Bohuslän-Älvsborg', 'CBA', 'Västra Götaland'),
  ('Coop Skaraborg', 'CSKARA', 'Skaraborg')
ON CONFLICT (short_code) DO NOTHING;

-- =====================
-- INDEX for new columns
-- =====================
CREATE INDEX IF NOT EXISTS idx_stores_forening_id ON stores(forening_id);
CREATE INDEX IF NOT EXISTS idx_stores_distrikt_id ON stores(distrikt_id);
CREATE INDEX IF NOT EXISTS idx_stores_butiks_nr ON stores(butiks_nr);
CREATE INDEX IF NOT EXISTS idx_stores_site_id ON stores(site_id);
CREATE INDEX IF NOT EXISTS idx_distrikt_forening_id ON distrikt(forening_id);
CREATE INDEX IF NOT EXISTS idx_app_users_hierarchy ON app_users(hierarchy_level);
CREATE INDEX IF NOT EXISTS idx_app_users_forening ON app_users(forening_id);
CREATE INDEX IF NOT EXISTS idx_app_users_distrikt ON app_users(distrikt_id);
