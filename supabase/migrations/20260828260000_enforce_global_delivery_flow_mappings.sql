-- Delivery category mappings are global master data shared by every store.
-- There must be exactly one mapping per category and no store_id on this table.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'delivery_category_flow_mappings'
      AND column_name = 'store_id'
  ) THEN
    RAISE EXCEPTION 'delivery_category_flow_mappings must remain global and cannot contain store_id';
  END IF;
END $$;

COMMENT ON TABLE delivery_category_flow_mappings IS
  'Global mapping from delivery-note categories to replacement flows, shared by all stores';
COMMENT ON COLUMN delivery_category_flow_mappings.category IS
  'Delivery-note category; globally unique across all stores';
COMMENT ON COLUMN delivery_category_flow_mappings.flow IS
  'Replacement flow shared globally: Färsk, Torrt, or Fryst';