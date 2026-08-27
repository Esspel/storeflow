-- Idempotent migration to separate product shelf life masterdata from delivery history
-- Master data: product_shelf_life (global, same for all stores)
-- Delivery history: store_product_deliveries (per store, tracks each delivery)

DO $$
BEGIN
    -- Create store_product_deliveries table if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'store_product_deliveries') THEN
        CREATE TABLE store_product_deliveries (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            sap_article_id text NOT NULL REFERENCES products(sap_article_id) ON DELETE CASCADE,
            store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
            arrival_date timestamptz NOT NULL,
            best_before_date timestamptz NOT NULL,
            delivery_number text,
            order_number text,
            quantity integer NOT NULL DEFAULT 0,
            status text NOT NULL DEFAULT 'delivered',
            order_line integer,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
    END IF;

    -- Create indexes for efficient querying
    CREATE INDEX IF NOT EXISTS idx_store_product_deliveries_store ON store_product_deliveries(store_id);
    CREATE INDEX IF NOT EXISTS idx_store_product_deliveries_sap_article ON store_product_deliveries(sap_article_id);
    CREATE INDEX IF NOT EXISTS idx_store_product_deliveries_arrival ON store_product_deliveries(arrival_date);
    CREATE INDEX IF NOT EXISTS idx_store_product_deliveries_best_before ON store_product_deliveries(best_before_date);
END $$;

-- Add comments for documentation
COMMENT ON TABLE store_product_deliveries IS 'Per-store delivery history tracking each product arrival and expiration';
COMMENT ON COLUMN store_product_deliveries.sap_article_id IS 'Foreign key to product.sap_article_id (master data)';
COMMENT ON COLUMN store_product_deliveries.store_id IS 'Which store this delivery record belongs to';
COMMENT ON COLUMN store_product_deliveries.best_before_date IS 'When the product expires according to delivery';
COMMENT ON COLUMN store_product_deliveries.delivery_number IS 'Delivery reference number from supplier';
COMMENT ON COLUMN store_product_deliveries.order_number IS 'Internal order number';
COMMENT ON COLUMN store_product_deliveries.quantity IS 'Number of units delivered';
COMMENT ON COLUMN store_product_deliveries.status IS 'Current status of delivery (delivered, pending, returned, etc.)';
COMMENT ON COLUMN store_product_deliveries.order_line IS 'Line item number in the order';
COMMENT ON COLUMN store_product_deliveries.created_at IS 'When this delivery record was created';
COMMENT ON COLUMN store_product_deliveries.updated_at IS 'When this delivery record was last updated';