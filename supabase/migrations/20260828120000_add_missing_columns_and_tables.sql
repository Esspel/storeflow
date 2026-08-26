/*
  # Fix missing DB columns / tables surfaced in production
  - spatial_markers.name (used by client join)
  - product_shelf_life.store_id (multi-tenant)
  - product_reclamation_stats (used by ersattningcheck)
*/

-- 1) spatial_markers.name (nullable so existing rows don't fail)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'spatial_markers' AND column_name = 'name'
  ) THEN
    ALTER TABLE spatial_markers ADD COLUMN name text;
  END IF;
END $$;

-- 2) product_shelf_life.store_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_shelf_life' AND column_name = 'store_id'
  ) THEN
    ALTER TABLE product_shelf_life ADD COLUMN store_id uuid REFERENCES stores(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_product_shelf_life_store_id ON product_shelf_life(store_id);
  END IF;
END $$;

-- 3) product_reclamation_stats (view-style aggregated table)
CREATE TABLE IF NOT EXISTS product_reclamation_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES stores(id) ON DELETE CASCADE,
  sap_article_id text NOT NULL,
  name text,
  ean text,
  bnr text,
  delivery_count integer DEFAULT 0,
  reclamation_count integer DEFAULT 0,
  last_reclamation timestamptz,
  last_reclamation_reason text,
  last_delivery timestamptz,
  updated_at timestamptz DEFAULT now(),
  UNIQUE (store_id, sap_article_id)
);

ALTER TABLE product_reclamation_stats ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'product_reclamation_stats_select') THEN
    CREATE POLICY "product_reclamation_stats_select" ON product_reclamation_stats
      FOR SELECT USING (
        store_id = (SELECT active_store_id FROM app_users WHERE id = auth.uid())
        OR EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'product_reclamation_stats_manage') THEN
    CREATE POLICY "product_reclamation_stats_manage" ON product_reclamation_stats
      FOR ALL USING (
        store_id = (SELECT active_store_id FROM app_users WHERE id = auth.uid())
        OR EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role IN ('admin','manager'))
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_product_reclamation_stats_store_id ON product_reclamation_stats(store_id);
