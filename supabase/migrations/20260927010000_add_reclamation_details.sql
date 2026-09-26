-- Migration: Add delivery details and amount to reclamations table
-- Supports per-reclamation best-before date, arrival date, delivery number, and value

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reclamations' AND column_name = 'delivery_number'
  ) THEN
    ALTER TABLE reclamations ADD COLUMN delivery_number text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reclamations' AND column_name = 'arrival_date'
  ) THEN
    ALTER TABLE reclamations ADD COLUMN arrival_date text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reclamations' AND column_name = 'best_before_date'
  ) THEN
    ALTER TABLE reclamations ADD COLUMN best_before_date text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reclamations' AND column_name = 'amount'
  ) THEN
    ALTER TABLE reclamations ADD COLUMN amount numeric;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_reclamations_sap_article ON reclamations(sap_article_id);
CREATE INDEX IF NOT EXISTS idx_reclamations_delivery_number ON reclamations(delivery_number);
