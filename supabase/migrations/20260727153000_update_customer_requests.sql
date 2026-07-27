-- 1. Säkerställ att kolumnen staff_comment finns på customer_requests
ALTER TABLE customer_requests 
ADD COLUMN IF NOT EXISTS staff_comment TEXT;

-- 2. Om status-fältet har en CHECK-constraint, ta bort den gamla och lägg till de nya statusarna:
--    'open', 'ordered', 'fulfilled', 'declined', 'not_in_assortment', 'discontinued'
DO $$ 
BEGIN
  -- Ta bort befintlig check constraint om den finns
  IF EXISTS (
    SELECT 1 
    FROM information_schema.constraint_column_usage 
    WHERE table_name = 'customer_requests' AND constraint_name = 'customer_requests_status_check'
  ) THEN
    ALTER TABLE customer_requests DROP CONSTRAINT customer_requests_status_check;
  END IF;
END $$;

ALTER TABLE customer_requests 
ADD CONSTRAINT customer_requests_status_check 
CHECK (status IN ('open', 'ordered', 'fulfilled', 'declined', 'not_in_assortment', 'discontinued'));

-- 3. Om du istället använder en Postgres ENUM-typ för status (t.ex. customer_request_status):
/*
ALTER TYPE customer_request_status ADD VALUE IF NOT EXISTS 'not_in_assortment';
ALTER TYPE customer_request_status ADD VALUE IF NOT EXISTS 'discontinued';
*/

-- 4. Valfritt: Indexering för prestanda vid filtrering på status och butik
CREATE INDEX IF NOT EXISTS idx_customer_requests_store_status 
ON customer_requests(store_id, status);
