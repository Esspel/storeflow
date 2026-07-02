/*
# Add Mitt Coop category and article type fields to customer_requests

1. Changes to customer_requests
   - `mitt_coop_category_id` (integer, nullable) — stores the Mitt Coop product category ID for the requested product, used to build a filtered sortiment link.
   - `mitt_coop_status_code` (integer, nullable) — optional status code filter for the Mitt Coop link (e.g. 3 = Aktiv, 2 = Kommande).

2. Notes
   - Both columns are optional (nullable) — existing rows are unaffected.
   - No RLS changes needed; inherits existing policies from customer_requests.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customer_requests' AND column_name = 'mitt_coop_category_id'
  ) THEN
    ALTER TABLE customer_requests ADD COLUMN mitt_coop_category_id integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customer_requests' AND column_name = 'mitt_coop_status_code'
  ) THEN
    ALTER TABLE customer_requests ADD COLUMN mitt_coop_status_code integer;
  END IF;
END $$;
