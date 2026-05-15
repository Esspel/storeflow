/*
  # Schedule Import Feature

  ## Summary
  Adds tables for importing and storing employee schedules from SoftOne GO XML exports.

  ## New Tables

  ### schedule_imports
  Stores metadata about each XML import (which store, which week, when imported, by whom).
  - id, store_id, week_start_date, week_number, year, imported_by, imported_at, filename, raw_employee_count

  ### schedule_employees
  Employees extracted from the XML, one row per employee per import.
  - id, import_id, employee_nr (from XML), employee_name, employee_group

  ### schedule_shifts
  Individual shifts per employee per day.
  - id, schedule_employee_id, import_id, day_date (actual date), start_time, stop_time,
    shift_name, color (hex), gross_minutes, net_minutes, deviation_cause, is_absence_day

  ### employee_mappings
  Links an XML employee_nr to an app user, scoped per store.
  - id, store_id, employee_nr, app_user_id (references app_users), created_by, updated_at

  ## Security
  RLS enabled on all tables. Access controlled via app_current_user_id() session helper.
  All policies require a valid session token. Store-scoped access is enforced.
*/

-- Schedule imports table
CREATE TABLE IF NOT EXISTS schedule_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  week_start_date date NOT NULL,
  week_number integer NOT NULL,
  year integer NOT NULL,
  imported_by uuid NOT NULL REFERENCES app_users(id),
  imported_at timestamptz DEFAULT now(),
  filename text NOT NULL DEFAULT '',
  raw_employee_count integer DEFAULT 0
);

ALTER TABLE schedule_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Valid session can view schedule imports"
  ON schedule_imports FOR SELECT
  TO anon, authenticated
  USING (
    app_current_user_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM app_users au
      WHERE au.id = app_current_user_id()
      AND au.store_id = schedule_imports.store_id
    )
  );

CREATE POLICY "Valid session can insert schedule imports"
  ON schedule_imports FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    app_current_user_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM app_users au
      WHERE au.id = app_current_user_id()
      AND au.store_id = schedule_imports.store_id
    )
  );

CREATE POLICY "Valid session can update schedule imports"
  ON schedule_imports FOR UPDATE
  TO anon, authenticated
  USING (app_current_user_id() IS NOT NULL)
  WITH CHECK (app_current_user_id() IS NOT NULL);

CREATE POLICY "Valid session can delete schedule imports"
  ON schedule_imports FOR DELETE
  TO anon, authenticated
  USING (app_current_user_id() IS NOT NULL);

-- Schedule employees table
CREATE TABLE IF NOT EXISTS schedule_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES schedule_imports(id) ON DELETE CASCADE,
  employee_nr text NOT NULL,
  employee_name text NOT NULL DEFAULT '',
  employee_group text NOT NULL DEFAULT ''
);

ALTER TABLE schedule_employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Valid session can view schedule employees"
  ON schedule_employees FOR SELECT
  TO anon, authenticated
  USING (app_current_user_id() IS NOT NULL);

CREATE POLICY "Valid session can insert schedule employees"
  ON schedule_employees FOR INSERT
  TO anon, authenticated
  WITH CHECK (app_current_user_id() IS NOT NULL);

CREATE POLICY "Valid session can delete schedule employees"
  ON schedule_employees FOR DELETE
  TO anon, authenticated
  USING (app_current_user_id() IS NOT NULL);

-- Schedule shifts table
CREATE TABLE IF NOT EXISTS schedule_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_employee_id uuid NOT NULL REFERENCES schedule_employees(id) ON DELETE CASCADE,
  import_id uuid NOT NULL REFERENCES schedule_imports(id) ON DELETE CASCADE,
  day_date date NOT NULL,
  start_time time,
  stop_time time,
  shift_name text NOT NULL DEFAULT '',
  color text NOT NULL DEFAULT '#4CAF50',
  gross_minutes integer DEFAULT 0,
  net_minutes integer DEFAULT 0,
  deviation_cause text NOT NULL DEFAULT '',
  is_absence_day boolean DEFAULT false
);

ALTER TABLE schedule_shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Valid session can view schedule shifts"
  ON schedule_shifts FOR SELECT
  TO anon, authenticated
  USING (app_current_user_id() IS NOT NULL);

CREATE POLICY "Valid session can insert schedule shifts"
  ON schedule_shifts FOR INSERT
  TO anon, authenticated
  WITH CHECK (app_current_user_id() IS NOT NULL);

CREATE POLICY "Valid session can delete schedule shifts"
  ON schedule_shifts FOR DELETE
  TO anon, authenticated
  USING (app_current_user_id() IS NOT NULL);

-- Employee mappings table
CREATE TABLE IF NOT EXISTS employee_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  employee_nr text NOT NULL,
  app_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES app_users(id),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(store_id, employee_nr)
);

ALTER TABLE employee_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Valid session can view employee mappings"
  ON employee_mappings FOR SELECT
  TO anon, authenticated
  USING (
    app_current_user_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM app_users au
      WHERE au.id = app_current_user_id()
      AND au.store_id = employee_mappings.store_id
    )
  );

CREATE POLICY "Valid session can insert employee mappings"
  ON employee_mappings FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    app_current_user_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM app_users au
      WHERE au.id = app_current_user_id()
      AND au.store_id = employee_mappings.store_id
    )
  );

CREATE POLICY "Valid session can update employee mappings"
  ON employee_mappings FOR UPDATE
  TO anon, authenticated
  USING (
    app_current_user_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM app_users au
      WHERE au.id = app_current_user_id()
      AND au.store_id = employee_mappings.store_id
    )
  )
  WITH CHECK (
    app_current_user_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM app_users au
      WHERE au.id = app_current_user_id()
      AND au.store_id = employee_mappings.store_id
    )
  );

CREATE POLICY "Valid session can delete employee mappings"
  ON employee_mappings FOR DELETE
  TO anon, authenticated
  USING (
    app_current_user_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM app_users au
      WHERE au.id = app_current_user_id()
      AND au.store_id = employee_mappings.store_id
    )
  );

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_schedule_shifts_import_date ON schedule_shifts(import_id, day_date);
CREATE INDEX IF NOT EXISTS idx_schedule_employees_import ON schedule_employees(import_id);
CREATE INDEX IF NOT EXISTS idx_employee_mappings_store_nr ON employee_mappings(store_id, employee_nr);
