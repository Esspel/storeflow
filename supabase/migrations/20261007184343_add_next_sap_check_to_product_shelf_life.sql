-- Lägg till next_sap_check och sap_data_missing till product_shelf_life
-- Kolumnen saknas i ursprunglig migration men används av ersättningscheck
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'product_shelf_life' AND column_name = 'next_sap_check') THEN
        ALTER TABLE product_shelf_life ADD COLUMN next_sap_check timestamptz;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'product_shelf_life' AND column_name = 'sap_data_missing') THEN
        ALTER TABLE product_shelf_life ADD COLUMN sap_data_missing boolean DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'product_shelf_life' AND column_name = 'updated_at') THEN
        ALTER TABLE product_shelf_life ADD COLUMN updated_at timestamptz DEFAULT now();
    END IF;
END $$;
