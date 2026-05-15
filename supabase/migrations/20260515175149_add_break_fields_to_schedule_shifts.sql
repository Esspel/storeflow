/*
  # Add break tracking fields to schedule_shifts

  Adds columns to store break duration and break window data extracted from
  XML fields ScheduleBreakTime, ScheduleBreakXStart, ScheduleBreakXMinutes.
  
  - break_minutes: total break duration in minutes (from ScheduleBreakTime)
  - break_windows: JSON array of { start: "HH:MM", minutes: number } objects
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'schedule_shifts' AND column_name = 'break_minutes'
  ) THEN
    ALTER TABLE schedule_shifts ADD COLUMN break_minutes integer NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'schedule_shifts' AND column_name = 'break_windows'
  ) THEN
    ALTER TABLE schedule_shifts ADD COLUMN break_windows jsonb NOT NULL DEFAULT '[]'::jsonb;
  END IF;
END $$;
