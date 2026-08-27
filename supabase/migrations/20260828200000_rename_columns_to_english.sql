-- 2026-08-28: Rename Swedish column names to English
-- This migration aligns schema with the English column names used in the codebase

-- ============================================
-- products table (already has both Swedish and English)
-- ============================================
-- The 'products' table from 20260823140000 uses English columns (ean, bnr, name, brand)
-- The 'material_nr' is a primary key - rename to 'material_number' for consistency
ALTER TABLE products RENAME COLUMN material_nr TO material_number;
ALTER TABLE products RENAME COLUMN varumarke TO brand_name;
ALTER TABLE products RENAME COLUMN produktnamn TO product_name;
ALTER TABLE products RENAME COLUMN hallbarhetsdagar_tillverkning TO shelf_life_days;

-- ============================================
-- product_shelf_life table
-- ============================================
-- Rename Swedish date columns
ALTER TABLE product_shelf_life RENAME COLUMN leveransdag TO delivery_date;
ALTER TABLE product_shelf_life RENAME COLUMN best_före_datum TO best_before_date;
ALTER TABLE product_shelf_life RENAME COLUMN leveransnummer TO delivery_number;
ALTER TABLE product_shelf_life RENAME COLUMN ordernummer TO order_number;
ALTER TABLE product_shelf_life RENAME COLUMN orderrad TO order_line;
ALTER TABLE product_shelf_life TO pallnummer TO pallet_number;
ALTER TABLE product_shelf_life RENAME COLUMN beställningskvantitet TO order_quantity;
ALTER TABLE product_shelf_life RENAME COLUMN pris_per_leveransenhet TO price_per_delivery_unit;
ALTER TABLE product_shelf_life RENAME COLUMN leveransstatus TO delivery_status;
ALTER TABLE product_shelf_life RENAME COLUMN sann_vikt TO actual_weight;
ALTER TABLE product_shelf_life RENAME COLUMN förväntad_kvantitet TO expected_quantity;

-- ============================================
-- stores table - rename Swedish section names
-- ============================================
ALTER TABLE store_avdelningar RENAME TO store_departments;
ALTER TABLE store_departments RENAME COLUMN namn TO name;
ALTER TABLE store_departments RENAME COLUMN store_id TO store_id;

-- Rename sections table
ALTER TABLE store_sektioner RENAME TO store_sections;
ALTER TABLE store_sections RENAME COLUMN namn TO name;
ALTER TABLE store_sections RENAME COLUMN skepp_id TO shelf_id;
ALTER TABLE store_sections RENAME COLUMN pos_x_cm TO pos_x_cm;
ALTER TABLE store_sections RENAME COLUMN pos_y_cm TO pos_y_cm;
ALTER TABLE store_sections RENAME COLUMN bredd_cm TO width_cm;
ALTER TABLE store_sections RENAME COLUMN höjd_cm TO height_cm;
ALTER TABLE store_sections RENAME COLUMN djup_cm TO depth_cm;

-- Rename shelves table
ALTER TABLE store_hyllor RENAME TO store_shelves;
ALTER TABLE store_shelves RENAME COLUMN planogram_id TO planogram_id;

-- Rename packaging table
ALTER TABLE store_skepp RENAME TO store_packaging;
ALTER TABLE store_packaging RENAME COLUMN namn TO name;
ALTER TABLE store_packaging RENAME COLUMN marker_id TO marker_code;

-- ============================================
-- Update indexes and constraints
-- ============================================
DROP INDEX IF EXISTS idx_avdelning_store;
CREATE INDEX idx_store_departments_store ON store_departments (store_id);

DROP INDEX IF EXISTS idx_sektion_avdelning;
CREATE INDEX idx_store_sections_department ON store_sections (avdelning_id);

DROP INDEX IF EXISTS idx_skepp_store;
CREATE INDEX idx_store_packaging_store ON store_packaging (store_id);

-- ============================================
-- Add RLS policies for renamed tables
-- ============================================
ALTER TABLE store_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_shelves ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_packaging ENABLE ROW LEVEL SECURITY;

-- Policies for store_departments
CREATE POLICY "store_departments_select" ON store_departments
  FOR SELECT USING (store_id = (SELECT active_store_id FROM app_users WHERE id = auth.uid()));

-- Policies for store_sections
CREATE POLICY "store_sections_select" ON store_sections
  FOR SELECT USING (
    store_id = (SELECT active_store_id FROM app_users WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM store_departments WHERE id = store_sections.avdelning_id AND store_id = (SELECT active_store_id FROM app_users WHERE id = auth.uid()))
  );

-- Policies for store_packaging
CREATE POLICY "store_packaging_select" ON store_packaging
  FOR SELECT USING (store_id = (SELECT active_store_id FROM app_users WHERE id = auth.uid()));