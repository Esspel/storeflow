-- product_shelf_life is master data; delivery dates belong to the delivery history table.
-- Keep the legacy columns for backwards compatibility, but do not require them for shelf-life updates.

ALTER TABLE product_shelf_life
  ALTER COLUMN expiry_date DROP NOT NULL;

ALTER TABLE product_shelf_life
  ALTER COLUMN arrival_date DROP NOT NULL;