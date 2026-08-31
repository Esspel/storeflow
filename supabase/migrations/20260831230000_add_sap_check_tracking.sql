-- Add SAP check tracking for cooldown management
-- Tracks when each store's SAP data was last fetched

DO $$
BEGIN
  -- 1. Add last_sap_check column to stores table
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stores' AND column_name = 'last_sap_check'
  ) THEN
    ALTER TABLE stores ADD COLUMN last_sap_check timestamptz;
  END IF;
END $$;

DO $$
BEGIN
  -- 2. Add sap_has_shelf_life flag to products table
  -- This helps track which articles have shelf life data in SAP
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'sap_has_shelf_life'
  ) THEN
    ALTER TABLE products ADD COLUMN sap_has_shelf_life boolean DEFAULT true;
  END IF;
END $$;

-- Create index for last_sap_check queries
CREATE INDEX IF NOT EXISTS idx_stores_last_sap_check ON stores(last_sap_check);

-- RLS policies for new columns (inherits existing table policies)
-- No new RLS needed as stores already has policies
