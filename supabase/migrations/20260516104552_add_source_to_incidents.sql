/*
  # Add source field to incidents table

  1. Changes
    - Adds `source` text column to `incidents` (nullable, default null)
    - Used to mark incidents created from specific flows (e.g. 'kundrunda')
    - Existing incidents remain null (standard manual reports)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'incidents' AND column_name = 'source'
  ) THEN
    ALTER TABLE incidents ADD COLUMN source text DEFAULT NULL;
  END IF;
END $$;
