-- Preserve the complete delivery-note row while keeping delivery history append-only.

DO $$
BEGIN
  ALTER TABLE store_product_deliveries ALTER COLUMN best_before_date DROP NOT NULL;
  ALTER TABLE store_product_deliveries ALTER COLUMN arrival_date DROP NOT NULL;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'store_product_deliveries' AND column_name = 'pallet_number') THEN ALTER TABLE store_product_deliveries ADD COLUMN pallet_number text; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'store_product_deliveries' AND column_name = 'product_name') THEN ALTER TABLE store_product_deliveries ADD COLUMN product_name text; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'store_product_deliveries' AND column_name = 'brand') THEN ALTER TABLE store_product_deliveries ADD COLUMN brand text; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'store_product_deliveries' AND column_name = 'bnr') THEN ALTER TABLE store_product_deliveries ADD COLUMN bnr text; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'store_product_deliveries' AND column_name = 'content') THEN ALTER TABLE store_product_deliveries ADD COLUMN content text; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'store_product_deliveries' AND column_name = 'order_quantity') THEN ALTER TABLE store_product_deliveries ADD COLUMN order_quantity text; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'store_product_deliveries' AND column_name = 'order_unit') THEN ALTER TABLE store_product_deliveries ADD COLUMN order_unit text; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'store_product_deliveries' AND column_name = 'unit_conversion') THEN ALTER TABLE store_product_deliveries ADD COLUMN unit_conversion text; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'store_product_deliveries' AND column_name = 'actual_weight_kg') THEN ALTER TABLE store_product_deliveries ADD COLUMN actual_weight_kg text; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'store_product_deliveries' AND column_name = 'price_per_delivery_unit') THEN ALTER TABLE store_product_deliveries ADD COLUMN price_per_delivery_unit text; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'store_product_deliveries' AND column_name = 'total_price') THEN ALTER TABLE store_product_deliveries ADD COLUMN total_price text; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'store_product_deliveries' AND column_name = 'category') THEN ALTER TABLE store_product_deliveries ADD COLUMN category text; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'store_product_deliveries' AND column_name = 'expected_quantity') THEN ALTER TABLE store_product_deliveries ADD COLUMN expected_quantity text; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'store_product_deliveries' AND column_name = 'delivery_status') THEN ALTER TABLE store_product_deliveries ADD COLUMN delivery_status text; END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_store_product_deliveries_status
  ON store_product_deliveries(store_id, status, arrival_date DESC);