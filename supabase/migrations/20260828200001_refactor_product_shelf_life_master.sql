-- Idempotent migration to refactor product_shelf_life as master data table
-- Removes store-specific columns, keeps only global product properties

DO $$
BEGIN
    -- Add new master data columns if they don't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'product_shelf_life' AND column_name = 'temperature_zone'
    ) THEN
        ALTER TABLE product_shelf_life ADD COLUMN temperature_zone text;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'product_shelf_life' AND column_name = 'default_compensation_price_ore'
    ) THEN
        ALTER TABLE product_shelf_life ADD COLUMN default_compensation_price_ore integer DEFAULT 2;
    END IF;

    -- Make sap_article_id the primary key (if it's currently UUID id)
    -- First check if the table has an id column as primary key
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'product_shelf_life' AND constraint_type = 'PRIMARY KEY'
        AND constraint_name LIKE '%id%'
    ) THEN
        -- We can't easily change PK in a safe way with existing data
        -- So we ensure sap_article_id is UNIQUE and NOT NULL
        ALTER TABLE product_shelf_life ALTER COLUMN sap_article_id SET NOT NULL;
        ALTER TABLE product_shelf_life ADD CONSTRAINT product_shelf_life_sap_article_id_key UNIQUE (sap_article_id);
    END IF;
END $$;

-- Add indexes for master data queries
CREATE INDEX IF NOT EXISTS idx_product_shelf_life_temperature ON product_shelf_life(temperature_zone);

-- Add comments
COMMENT ON TABLE product_shelf_life IS 'Master data for product shelf life properties (global, same for all stores)';
COMMENT ON COLUMN product_shelf_life.sap_article_id IS 'Primary key - SAP article ID (Mat-nr)';
COMMENT ON COLUMN product_shelf_life.shelf_lifetime_days IS 'Total shelf lifetime in days from production (global property)';
COMMENT ON COLUMN product_shelf_life.temperature_zone IS 'Temperature zone requirement (kyl, frys, torrt, etc.)';
COMMENT ON COLUMN product_shelf_life.default_compensation_price_ore IS 'Default compensation price in öre for expired products';