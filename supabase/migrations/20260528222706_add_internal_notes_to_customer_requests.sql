/*
  # Add internal_notes column to customer_requests

  The `notes` column is used for customer-submitted extra info ("Övrig information").
  Staff need a separate internal notes field that is never shown to customers.
  
  - New column `internal_notes` (text, nullable) — visible only to staff
  - Existing `notes` column remains as the customer's "Övrig information"
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customer_requests' AND column_name = 'internal_notes'
  ) THEN
    ALTER TABLE customer_requests ADD COLUMN internal_notes text;
  END IF;
END $$;
