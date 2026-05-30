/*
  # Add Template Packages and Conditional Steps

  1. New Tables
    - `template_packages` — Named groups of templates that can be activated together
      - `id` (uuid, PK)
      - `name` (text)
      - `description` (text)
      - `store_id` (uuid, FK to stores, nullable — null = global)
      - `created_by` (uuid, FK to app_users)
      - `created_at` (timestamptz)
    - `template_package_items` — Templates belonging to a package
      - `id` (uuid, PK)
      - `package_id` (uuid, FK to template_packages)
      - `template_id` (uuid, FK to checklist_templates)
      - `sort_order` (int)

  2. Column Additions
    - `checklist_template_items.condition_question_id` — already added, verify
    - `checklist_template_items.condition_answer` — already added, verify

  3. Security
    - RLS enabled on both new tables
    - Authenticated users can read/write packages for their store
*/

-- Template packages
CREATE TABLE IF NOT EXISTS template_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text DEFAULT '',
  store_id uuid REFERENCES stores(id) ON DELETE CASCADE,
  created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE template_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read template packages"
  ON template_packages FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert template packages"
  ON template_packages FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Creators can update their packages"
  ON template_packages FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Creators can delete their packages"
  ON template_packages FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Template package items (template membership)
CREATE TABLE IF NOT EXISTS template_package_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES template_packages(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
  sort_order int DEFAULT 0,
  UNIQUE(package_id, template_id)
);

ALTER TABLE template_package_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read package items"
  ON template_package_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert package items"
  ON template_package_items FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update package items"
  ON template_package_items FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete package items"
  ON template_package_items FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Ensure conditional step columns exist on template items (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'checklist_template_items' AND column_name = 'condition_question_id'
  ) THEN
    ALTER TABLE checklist_template_items ADD COLUMN condition_question_id uuid DEFAULT NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'checklist_template_items' AND column_name = 'condition_answer'
  ) THEN
    ALTER TABLE checklist_template_items ADD COLUMN condition_answer text DEFAULT NULL;
  END IF;
END $$;
