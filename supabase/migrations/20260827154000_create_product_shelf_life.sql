-- Idempotent: Creates product_shelf_life table if it doesn't exist
-- Shelf life data is global (same for all stores), linked via sap_article_id

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'product_shelf_life') THEN
    CREATE TABLE IF NOT EXISTS product_shelf_life (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        sap_article_id text NOT NULL UNIQUE,
        shelf_lifetime_days integer NOT NULL,
        expiry_date timestamptz NOT NULL,
        arrival_date timestamptz NOT NULL,
        compensation_price_ore integer DEFAULT 2,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
    );

    -- Indexer för snabbare sökningar
    CREATE INDEX IF NOT EXISTS idx_product_shelf_life_sap ON product_shelf_life(sap_article_id);
    CREATE INDEX IF NOT EXISTS idx_product_shelf_life_arrival ON product_shelf_life(arrival_date);
    CREATE INDEX IF NOT EXISTS idx_product_shelf_life_expiry ON product_shelf_life(expiry_date);
    END IF;
END $$;