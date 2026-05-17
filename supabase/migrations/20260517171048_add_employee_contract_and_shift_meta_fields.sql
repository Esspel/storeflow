/*
  # Add contract & metadata fields to schedule_employees and schedule_shifts

  ## New columns on schedule_employees
  - `employee_category` (text) — EmployeeCategory from XML (e.g. "Timanställd")
  - `employment_percent` (numeric) — EmploymentPercent from XML (e.g. 50.0 for 50%)
  - `work_time_week` (numeric) — EmploymentWorkTimeWeek in minutes from XML (agreed weekly hours)

  ## New columns on schedule_shifts
  - `is_preliminary` (boolean) — IsPreliminary from XML Day element
  - `is_zero_schedule_day` (boolean) — IsZeroScheduleDay from XML Day element
  - `shift_description` (text) — ShiftXDescription / ShiftDescription from XML
*/

DO $$
BEGIN
  -- schedule_employees new columns
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'schedule_employees' AND column_name = 'employee_category'
  ) THEN
    ALTER TABLE schedule_employees ADD COLUMN employee_category text NOT NULL DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'schedule_employees' AND column_name = 'employment_percent'
  ) THEN
    ALTER TABLE schedule_employees ADD COLUMN employment_percent numeric DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'schedule_employees' AND column_name = 'work_time_week'
  ) THEN
    ALTER TABLE schedule_employees ADD COLUMN work_time_week numeric DEFAULT NULL;
  END IF;

  -- schedule_shifts new columns
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'schedule_shifts' AND column_name = 'is_preliminary'
  ) THEN
    ALTER TABLE schedule_shifts ADD COLUMN is_preliminary boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'schedule_shifts' AND column_name = 'is_zero_schedule_day'
  ) THEN
    ALTER TABLE schedule_shifts ADD COLUMN is_zero_schedule_day boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'schedule_shifts' AND column_name = 'shift_description'
  ) THEN
    ALTER TABLE schedule_shifts ADD COLUMN shift_description text NOT NULL DEFAULT '';
  END IF;
END $$;
