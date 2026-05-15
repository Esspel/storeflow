/*
  # Add borrowed staff tracking to schedule_shifts

  1. Changes
    - `shift_link` (text): Stores the GUID from XML ShiftLink field; non-empty means shift is linked to another store
    - `is_borrowed` (boolean): True when ShiftLink is a non-empty GUID AND ShiftTotalCost is exactly 0.00 — indicates staff borrowed from another store ('Remote Unit Assignment')
    - `is_shadow_shift` (boolean): True when the day is an absence day but shift details (times/name) are preserved from the original schedule — the shift exists only as metadata, not as worked time

  2. Notes
    - All three columns default to safe values (empty string / false) so existing rows are unaffected
    - No data is dropped; migration is fully additive
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'schedule_shifts' AND column_name = 'shift_link'
  ) THEN
    ALTER TABLE schedule_shifts ADD COLUMN shift_link text NOT NULL DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'schedule_shifts' AND column_name = 'is_borrowed'
  ) THEN
    ALTER TABLE schedule_shifts ADD COLUMN is_borrowed boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'schedule_shifts' AND column_name = 'is_shadow_shift'
  ) THEN
    ALTER TABLE schedule_shifts ADD COLUMN is_shadow_shift boolean NOT NULL DEFAULT false;
  END IF;
END $$;
