/*
  # Add regions table and link stores to regions

  ## Problem
  The stores.region column is a free-text field that was never filled in,
  so all HK-Dashboard analytics grouped everything under "Övrigt".

  ## Solution
  1. Create a structured regions table with admin-managed region records
  2. Add region_id FK to stores (nullable for backwards compatibility)
  3. Keep the legacy region text column but derive it from the regions table
     via a view or by updating it on write
  4. Seed a default set of Coop regions

  ## New Table: regions
  - id (uuid, PK)
  - name (text, unique) — e.g. "Stockholm", "Göteborg", "Norra Sverige"
  - code (text, unique, nullable) — short code for display
  - created_at (timestamptz)

  ## Modified Table: stores
  - Add column: region_id (uuid, FK → regions, nullable)
  - When region_id is set, the region text column is also updated by trigger
    so existing queries using stores.region continue to work

  ## Security
  - RLS on regions: anyone can SELECT (needed for store forms)
  - Only admins can INSERT/UPDATE/DELETE regions
*/

-- ── 1. Regions table ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS regions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text UNIQUE NOT NULL,
  code       text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE regions ENABLE ROW LEVEL SECURITY;

-- Anyone can read regions (needed in store create/edit forms)
CREATE POLICY "Anyone can read regions"
  ON regions FOR SELECT
  TO anon
  USING (true);

-- Only admins can manage regions
CREATE POLICY "Admins can insert regions"
  ON regions FOR INSERT
  TO anon
  WITH CHECK (app_current_user_role() = 'admin');

CREATE POLICY "Admins can update regions"
  ON regions FOR UPDATE
  TO anon
  USING (app_current_user_role() = 'admin')
  WITH CHECK (app_current_user_role() = 'admin');

CREATE POLICY "Admins can delete regions"
  ON regions FOR DELETE
  TO anon
  USING (app_current_user_role() = 'admin');

-- ── 2. Add region_id FK to stores ────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stores' AND column_name = 'region_id'
  ) THEN
    ALTER TABLE stores ADD COLUMN region_id uuid REFERENCES regions(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_stores_region_id ON stores (region_id);

-- ── 3. Trigger: keep stores.region text in sync with regions.name ─────────────
CREATE OR REPLACE FUNCTION sync_store_region_text()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.region_id IS NOT NULL THEN
    SELECT name INTO NEW.region FROM regions WHERE id = NEW.region_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_store_region ON stores;
CREATE TRIGGER trg_sync_store_region
  BEFORE INSERT OR UPDATE ON stores
  FOR EACH ROW
  EXECUTE FUNCTION sync_store_region_text();

-- ── 4. Seed default Coop regions ────────────────────────────────────────────
INSERT INTO regions (name, code) VALUES
  ('Stockholm',       'STO'),
  ('Göteborg',        'GBG'),
  ('Malmö/Skåne',     'MLM'),
  ('Mälardalen',      'MDL'),
  ('Norrland',        'NRL'),
  ('Väst',            'VST'),
  ('Öst',             'OST'),
  ('Syd',             'SYD'),
  ('Mitt',            'MIT')
ON CONFLICT (name) DO NOTHING;

-- ── 5. Backfill region_id for any stores that already have a region text ──────
UPDATE stores s
SET region_id = r.id
FROM regions r
WHERE lower(trim(s.region)) = lower(trim(r.name))
  AND s.region_id IS NULL
  AND s.region IS NOT NULL
  AND s.region != '';
