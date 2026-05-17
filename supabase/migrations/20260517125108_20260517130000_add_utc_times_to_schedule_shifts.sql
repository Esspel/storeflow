/*
  # Add UTC timestamps to schedule_shifts for DST-safe storage

  ## Summary
  Adds UTC-based timestamp columns to schedule_shifts so that shift times
  are stored in UTC (Europe/Stockholm converted) rather than as local strings.
  This prevents hour miscalculations during Swedish spring/autumn DST changes.

  ## Changes
  - schedule_shifts: add start_time_utc (timestamptz), stop_time_utc (timestamptz)
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='schedule_shifts' AND column_name='start_time_utc') THEN
    ALTER TABLE schedule_shifts ADD COLUMN start_time_utc timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='schedule_shifts' AND column_name='stop_time_utc') THEN
    ALTER TABLE schedule_shifts ADD COLUMN stop_time_utc timestamptz;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_schedule_shifts_start_utc ON schedule_shifts(start_time_utc) WHERE start_time_utc IS NOT NULL;
