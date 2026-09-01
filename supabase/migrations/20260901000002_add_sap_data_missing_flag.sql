-- Add sap_data_missing flag to product_shelf_life
-- Marks articles where SAP has no shelf life data

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_shelf_life' AND column_name = 'sap_data_missing'
  ) THEN
    ALTER TABLE product_shelf_life ADD COLUMN sap_data_missing boolean DEFAULT false;
  END IF;
END $$;
