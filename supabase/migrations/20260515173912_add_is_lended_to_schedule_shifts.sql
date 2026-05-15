/*
  # Add is_lended to schedule_shifts

  Adds a boolean column is_lended to track whether a shift is lent out to or
  borrowed from another store (ShiftLended = 1 in the XML).
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'schedule_shifts' AND column_name = 'is_lended'
  ) THEN
    ALTER TABLE schedule_shifts ADD COLUMN is_lended boolean NOT NULL DEFAULT false;
  END IF;
END $$;
