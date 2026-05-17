/*
  # Extend Enterprise Hierarchy: Delivery Plans, Store Fields, and Hierarchy Enhancements

  ## Summary
  Extends the existing enterprise hierarchy with additional store CSV fields, delivery plan 
  special week support, borrowed staff tracking, kundrunda local versions, and operational 
  exception tracking.

  ## Changes
  - foreningar: ensure table exists with RLS
  - distrikt: ensure table exists with RLS
  - stores: add all 32 CSV fields
  - app_users: add forening_id, distrikt_id, hierarchy_level
  - delivery_plans: add week_number, year, is_special_week, holiday_name, is_default_template, notes
  - schedule_shifts: add borrowed_from_store_id
  - kundrunda_local_versions: new table for store-level overrides
  - operational_exceptions: new table for missing schedule/delivery plan tracking
*/

-- Ensure föreningar table exists (idempotent)
CREATE TABLE IF NOT EXISTS foreningar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  short_code text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE foreningar ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='foreningar' AND policyname='Authenticated users can read foreningar') THEN
    EXECUTE 'CREATE POLICY "Authenticated users can read foreningar" ON foreningar FOR SELECT TO authenticated USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='foreningar' AND policyname='Admins can manage foreningar') THEN
    EXECUTE 'CREATE POLICY "Admins can manage foreningar" ON foreningar FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM app_users WHERE id = app_current_user_id() AND role IN (''admin'',''manager'')))';
  END IF;
END $$;

-- Ensure distrikt table exists (idempotent)
CREATE TABLE IF NOT EXISTS distrikt (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  forening_id uuid REFERENCES foreningar(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE distrikt ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='distrikt' AND policyname='Authenticated users can read distrikt') THEN
    EXECUTE 'CREATE POLICY "Authenticated users can read distrikt" ON distrikt FOR SELECT TO authenticated USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='distrikt' AND policyname='Admins can manage distrikt') THEN
    EXECUTE 'CREATE POLICY "Admins can manage distrikt" ON distrikt FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM app_users WHERE id = app_current_user_id() AND role IN (''admin'',''manager'')))';
  END IF;
END $$;

-- Add missing store fields (idempotent via DO blocks)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='forening_id') THEN
    ALTER TABLE stores ADD COLUMN forening_id uuid REFERENCES foreningar(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='distrikt_id') THEN
    ALTER TABLE stores ADD COLUMN distrikt_id uuid REFERENCES distrikt(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='butiks_nr') THEN
    ALTER TABLE stores ADD COLUMN butiks_nr text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='bolag') THEN
    ALTER TABLE stores ADD COLUMN bolag text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='koncept') THEN
    ALTER TABLE stores ADD COLUMN koncept text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='kommentar') THEN
    ALTER TABLE stores ADD COLUMN kommentar text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='butik_enhet') THEN
    ALTER TABLE stores ADD COLUMN butik_enhet text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='foretag') THEN
    ALTER TABLE stores ADD COLUMN foretag text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='enhet') THEN
    ALTER TABLE stores ADD COLUMN enhet text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='organisationsnummer') THEN
    ALTER TABLE stores ADD COLUMN organisationsnummer text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='franchise') THEN
    ALTER TABLE stores ADD COLUMN franchise boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='gatuadress') THEN
    ALTER TABLE stores ADD COLUMN gatuadress text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='postnr') THEN
    ALTER TABLE stores ADD COLUMN postnr text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='postadress') THEN
    ALTER TABLE stores ADD COLUMN postadress text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='email_sm_chef') THEN
    ALTER TABLE stores ADD COLUMN email_sm_chef text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='butikschef') THEN
    ALTER TABLE stores ADD COLUMN butikschef text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='telefon_butik') THEN
    ALTER TABLE stores ADD COLUMN telefon_butik text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='bc_telefon') THEN
    ALTER TABLE stores ADD COLUMN bc_telefon text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='mobil') THEN
    ALTER TABLE stores ADD COLUMN mobil text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='direktor_forsaljning') THEN
    ALTER TABLE stores ADD COLUMN direktor_forsaljning text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='forsaljningschef') THEN
    ALTER TABLE stores ADD COLUMN forsaljningschef text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='marknadsorrade') THEN
    ALTER TABLE stores ADD COLUMN marknadsorrade text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='distriktschef') THEN
    ALTER TABLE stores ADD COLUMN distriktschef text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='distrikt_namn') THEN
    ALTER TABLE stores ADD COLUMN distrikt_namn text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='k_stalle') THEN
    ALTER TABLE stores ADD COLUMN k_stalle text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='namn2') THEN
    ALTER TABLE stores ADD COLUMN namn2 text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='gamla_butiksnummer') THEN
    ALTER TABLE stores ADD COLUMN gamla_butiksnummer text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='saljplan') THEN
    ALTER TABLE stores ADD COLUMN saljplan text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='sak_kval_samordnare') THEN
    ALTER TABLE stores ADD COLUMN sak_kval_samordnare text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='kommun') THEN
    ALTER TABLE stores ADD COLUMN kommun text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='hr_generalist') THEN
    ALTER TABLE stores ADD COLUMN hr_generalist text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='bemanningsspecialist') THEN
    ALTER TABLE stores ADD COLUMN bemanningsspecialist text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='site_id') THEN
    ALTER TABLE stores ADD COLUMN site_id text;
  END IF;
END $$;

-- Add hierarchy fields to app_users
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='app_users' AND column_name='forening_id') THEN
    ALTER TABLE app_users ADD COLUMN forening_id uuid REFERENCES foreningar(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='app_users' AND column_name='distrikt_id') THEN
    ALTER TABLE app_users ADD COLUMN distrikt_id uuid REFERENCES distrikt(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='app_users' AND column_name='hierarchy_level') THEN
    ALTER TABLE app_users ADD COLUMN hierarchy_level text DEFAULT 'anvandare' CHECK (hierarchy_level IN ('admin','hk','forening','distrikt','chef','anvandare'));
  END IF;
END $$;

-- Delivery plans: add special week fields
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
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='delivery_plans' AND column_name='holiday_name') THEN
    ALTER TABLE delivery_plans ADD COLUMN holiday_name text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='delivery_plans' AND column_name='is_default_template') THEN
    ALTER TABLE delivery_plans ADD COLUMN is_default_template boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='delivery_plans' AND column_name='notes') THEN
    ALTER TABLE delivery_plans ADD COLUMN notes text;
  END IF;
END $$;

-- Borrowed staff tracking in schedule_shifts
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='schedule_shifts' AND column_name='borrowed_from_store_id') THEN
    ALTER TABLE schedule_shifts ADD COLUMN borrowed_from_store_id uuid REFERENCES stores(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Kundrunda local versions table for store-level overrides
CREATE TABLE IF NOT EXISTS kundrunda_local_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  template_id uuid REFERENCES checklist_templates(id) ON DELETE SET NULL,
  version_number integer NOT NULL DEFAULT 1,
  is_active boolean DEFAULT true,
  source text DEFAULT 'local' CHECK (source IN ('central','local','parallel_central','parallel_local')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE kundrunda_local_versions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='kundrunda_local_versions' AND policyname='Users can view local versions for their store') THEN
    EXECUTE 'CREATE POLICY "Users can view local versions for their store" ON kundrunda_local_versions FOR SELECT TO authenticated USING (store_id IN (SELECT store_id FROM user_stores WHERE user_id = app_current_user_id()) OR EXISTS (SELECT 1 FROM app_users WHERE id = app_current_user_id() AND role IN (''admin'',''manager'')))';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='kundrunda_local_versions' AND policyname='Managers can insert local versions') THEN
    EXECUTE 'CREATE POLICY "Managers can insert local versions" ON kundrunda_local_versions FOR INSERT TO authenticated WITH CHECK (store_id IN (SELECT store_id FROM user_stores WHERE user_id = app_current_user_id()) OR EXISTS (SELECT 1 FROM app_users WHERE id = app_current_user_id() AND role = ''admin''))';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='kundrunda_local_versions' AND policyname='Managers can update local versions') THEN
    EXECUTE 'CREATE POLICY "Managers can update local versions" ON kundrunda_local_versions FOR UPDATE TO authenticated USING (store_id IN (SELECT store_id FROM user_stores WHERE user_id = app_current_user_id()) OR EXISTS (SELECT 1 FROM app_users WHERE id = app_current_user_id() AND role = ''admin'')) WITH CHECK (store_id IN (SELECT store_id FROM user_stores WHERE user_id = app_current_user_id()) OR EXISTS (SELECT 1 FROM app_users WHERE id = app_current_user_id() AND role = ''admin''))';
  END IF;
END $$;

-- Operational exceptions table
CREATE TABLE IF NOT EXISTS operational_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  exception_type text NOT NULL CHECK (exception_type IN ('missing_schedule','missing_delivery_plan','missing_special_week_plan')),
  week_number integer,
  year integer,
  holiday_name text,
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE operational_exceptions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='operational_exceptions' AND policyname='HK and admin can view operational exceptions') THEN
    EXECUTE 'CREATE POLICY "HK and admin can view operational exceptions" ON operational_exceptions FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM app_users WHERE id = app_current_user_id() AND role IN (''admin'',''manager'')))';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='operational_exceptions' AND policyname='Admin can insert operational exceptions') THEN
    EXECUTE 'CREATE POLICY "Admin can insert operational exceptions" ON operational_exceptions FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM app_users WHERE id = app_current_user_id() AND role IN (''admin'',''manager'')))';
  END IF;
END $$;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_stores_forening_id ON stores(forening_id);
CREATE INDEX IF NOT EXISTS idx_stores_distrikt_id ON stores(distrikt_id);
CREATE INDEX IF NOT EXISTS idx_stores_butiks_nr ON stores(butiks_nr);
CREATE INDEX IF NOT EXISTS idx_stores_bolag ON stores(bolag);
CREATE INDEX IF NOT EXISTS idx_app_users_hierarchy_level ON app_users(hierarchy_level);
CREATE INDEX IF NOT EXISTS idx_app_users_forening_id ON app_users(forening_id);
CREATE INDEX IF NOT EXISTS idx_schedule_shifts_borrowed ON schedule_shifts(borrowed_from_store_id) WHERE borrowed_from_store_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_delivery_plans_week_year ON delivery_plans(store_id, year, week_number);
CREATE INDEX IF NOT EXISTS idx_operational_exceptions_store ON operational_exceptions(store_id, year, week_number);
