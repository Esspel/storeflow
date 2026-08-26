-- Migration: Add zip organization columns and reclamation history tables
-- Created: 2026-08-27

-- 1. Add delivery number tracking to product_shelf_life
ALTER TABLE product_shelf_life ADD COLUMN IF NOT EXISTS delivery_number text;
ALTER TABLE product_shelf_life ADD COLUMN IF NOT EXISTS temperature_zone text CHECK (temperature_zone IN ('fryst', 'torr', 'färsk'));

-- 2. Index for new columns
CREATE INDEX IF NOT EXISTS idx_product_shelf_life_delivery ON product_shelf_life(delivery_number);
CREATE INDEX IF NOT EXISTS idx_product_shelf_life_zone ON product_shelf_life(temperature_zone);

-- 3. Create reclamation history tracking table
CREATE TABLE IF NOT EXISTS product_reclamation_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sap_article_id text NOT NULL,
  store_id text NOT NULL,
  delivery_number text,
  temperature_zone text CHECK (temperature_zone IN ('fryst', 'torr', 'färsk')),
  reclaimed_at timestamptz DEFAULT now(),
  reason text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reclamation_sap ON product_reclamation_history(sap_article_id);
CREATE INDEX IF NOT EXISTS idx_reclamation_store ON product_reclamation_history(store_id);
CREATE INDEX IF NOT EXISTS idx_reclamation_delivered ON product_reclamation_history(reclaimed_at);

-- 4. Create delivery log tracking table
CREATE TABLE IF NOT EXISTS product_delivery_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sap_article_id text NOT NULL,
  store_id text NOT NULL,
  delivery_number text,
  temperature_zone text CHECK (temperature_zone IN ('fryst', 'torr', 'färsk')),
  delivered_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_sap ON product_delivery_log(sap_article_id);
CREATE INDEX IF NOT EXISTS idx_delivery_store ON product_delivery_log(store_id);
CREATE INDEX IF NOT EXISTS idx_delivery_delivered ON product_delivery_log(delivered_at);
