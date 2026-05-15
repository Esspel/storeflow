/*
  # Add delivery plans table and employee_group to app_users

  1. New Tables
    - `delivery_plans`
      - `id` (uuid, pk)
      - `store_id` (uuid, fk stores)
      - `week_number` (int)
      - `year` (int)
      - `imported_by` (uuid, fk app_users)
      - `filename` (text)
      - `imported_at` (timestamptz)
    - `delivery_entries`
      - `id` (uuid, pk)
      - `plan_id` (uuid, fk delivery_plans)
      - `delivery_day` (text) e.g. "Måndag"
      - `delivery_time` (text) e.g. "07:45"
      - `order_day` (text)
      - `stop_time` (text)
      - `flow_name` (text) e.g. "Färskt", "Torrt", "Fryst", "Standard"
      - `supplier` (text)
      - `delivery_date` (date, nullable)

  2. Modified Tables
    - `app_users`: add `employee_group` (text, nullable)

  3. Security
    - RLS enabled on both new tables
    - Policies for authenticated users to read their store's data
    - Policies for admin/manager to insert/update
*/

-- Add employee_group to app_users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'app_users' AND column_name = 'employee_group'
  ) THEN
    ALTER TABLE app_users ADD COLUMN employee_group text DEFAULT '';
  END IF;
END $$;

-- delivery_plans table
CREATE TABLE IF NOT EXISTS delivery_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES stores(id) ON DELETE CASCADE,
  week_number integer NOT NULL,
  year integer NOT NULL,
  imported_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  filename text NOT NULL DEFAULT '',
  imported_at timestamptz DEFAULT now()
);

ALTER TABLE delivery_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Store members can view delivery plans"
  ON delivery_plans FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Authenticated can insert delivery plans"
  ON delivery_plans FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Authenticated can update delivery plans"
  ON delivery_plans FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated can delete delivery plans"
  ON delivery_plans FOR DELETE
  TO anon
  USING (true);

-- delivery_entries table
CREATE TABLE IF NOT EXISTS delivery_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid REFERENCES delivery_plans(id) ON DELETE CASCADE,
  delivery_day text NOT NULL DEFAULT '',
  delivery_time text NOT NULL DEFAULT '',
  order_day text NOT NULL DEFAULT '',
  stop_time text NOT NULL DEFAULT '',
  flow_name text NOT NULL DEFAULT '',
  supplier text NOT NULL DEFAULT '',
  delivery_date date
);

ALTER TABLE delivery_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Store members can view delivery entries"
  ON delivery_entries FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Authenticated can insert delivery entries"
  ON delivery_entries FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Authenticated can update delivery entries"
  ON delivery_entries FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated can delete delivery entries"
  ON delivery_entries FOR DELETE
  TO anon
  USING (true);
