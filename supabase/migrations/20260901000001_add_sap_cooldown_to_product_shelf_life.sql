-- Add SAP cooldown tracking to product_shelf_life
-- Each article gets a random cooldown (14-60 days) before being re-fetched from SAP

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_shelf_life' AND column_name = 'next_sap_check'
  ) THEN
    ALTER TABLE product_shelf_life ADD COLUMN next_sap_check timestamptz;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_product_shelf_life_next_sap_check ON product_shelf_life(next_sap_check);
