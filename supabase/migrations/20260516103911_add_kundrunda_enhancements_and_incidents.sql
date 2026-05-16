/*
  # Kundrunda enhancements: descriptions, reference images, common defects, incidents link

  ## Summary
  Extends the kundrunda system with several improvements:

  1. **Checkpoint descriptions** — `description` column on `kundrunda_checkpoints`
     so each checkpoint can show what to look for during inspection.

  2. **Reference images** — `kundrunda_checkpoint_images` table stores reference
     photos showing what "approved" looks like for a checkpoint.

  3. **Common defects** — `kundrunda_common_defects` table with predefined defect
     descriptions that can be quickly selected when recording a defect.

  4. **Kundrunda → Incident link** — `kundrunda_responses.incident_id` foreign key
     so defects from kundrundan automatically create (and link to) an incident.

  5. **Response images** — `kundrunda_response_images` table for photos taken
     during inspection for a specific response/defect.

  6. **Zone/checkpoint editing** — The existing tables already support CRUD via
     existing manager RLS policies, so no schema changes needed for that.

  ## New Tables

  ### kundrunda_checkpoint_images
  - `id` (uuid, PK)
  - `checkpoint_id` (uuid, FK kundrunda_checkpoints)
  - `storage_path` (text) — path in Supabase Storage
  - `uploaded_by` (uuid, FK app_users)
  - `created_at` (timestamptz)

  ### kundrunda_common_defects
  - `id` (uuid, PK)
  - `store_id` (uuid, nullable FK stores) — null = global
  - `label` (text) — short defect description
  - `sort_order` (int, default 0)
  - `created_at` (timestamptz)

  ### kundrunda_response_images
  - `id` (uuid, PK)
  - `response_id` (uuid, FK kundrunda_responses)
  - `session_id` (uuid, FK kundrunda_sessions)
  - `storage_path` (text)
  - `uploaded_by` (uuid, FK app_users)
  - `created_at` (timestamptz)

  ## Modified Columns
  - `kundrunda_checkpoints.description` (text, nullable) — what to check
  - `kundrunda_responses.incident_id` (uuid, nullable FK incidents) — linked incident
*/

-- 1. Add description to checkpoints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'kundrunda_checkpoints' AND column_name = 'description'
  ) THEN
    ALTER TABLE kundrunda_checkpoints ADD COLUMN description text;
  END IF;
END $$;

-- 2. Add incident_id to responses
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'kundrunda_responses' AND column_name = 'incident_id'
  ) THEN
    ALTER TABLE kundrunda_responses ADD COLUMN incident_id uuid REFERENCES incidents(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3. Reference images for checkpoints
CREATE TABLE IF NOT EXISTS kundrunda_checkpoint_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkpoint_id uuid NOT NULL REFERENCES kundrunda_checkpoints(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  uploaded_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE kundrunda_checkpoint_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Session users can read checkpoint images"
  ON kundrunda_checkpoint_images FOR SELECT
  TO anon, authenticated
  USING (app_current_user_id() IS NOT NULL);

CREATE POLICY "Managers can insert checkpoint images"
  ON kundrunda_checkpoint_images FOR INSERT
  TO anon, authenticated
  WITH CHECK (app_current_user_role() IN ('admin', 'manager'));

CREATE POLICY "Managers can delete checkpoint images"
  ON kundrunda_checkpoint_images FOR DELETE
  TO anon, authenticated
  USING (app_current_user_role() IN ('admin', 'manager'));

-- 4. Common defects
CREATE TABLE IF NOT EXISTS kundrunda_common_defects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES stores(id) ON DELETE CASCADE,
  label text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE kundrunda_common_defects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Session users can read common defects"
  ON kundrunda_common_defects FOR SELECT
  TO anon, authenticated
  USING (app_current_user_id() IS NOT NULL);

CREATE POLICY "Managers can insert common defects"
  ON kundrunda_common_defects FOR INSERT
  TO anon, authenticated
  WITH CHECK (app_current_user_role() IN ('admin', 'manager'));

CREATE POLICY "Managers can update common defects"
  ON kundrunda_common_defects FOR UPDATE
  TO anon, authenticated
  USING (app_current_user_role() IN ('admin', 'manager'))
  WITH CHECK (app_current_user_role() IN ('admin', 'manager'));

CREATE POLICY "Managers can delete common defects"
  ON kundrunda_common_defects FOR DELETE
  TO anon, authenticated
  USING (app_current_user_role() IN ('admin', 'manager'));

-- 5. Response images (photos taken during inspection)
CREATE TABLE IF NOT EXISTS kundrunda_response_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id uuid NOT NULL REFERENCES kundrunda_responses(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES kundrunda_sessions(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  uploaded_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE kundrunda_response_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Session users can read response images"
  ON kundrunda_response_images FOR SELECT
  TO anon, authenticated
  USING (app_current_user_id() IS NOT NULL);

CREATE POLICY "Session users can insert response images"
  ON kundrunda_response_images FOR INSERT
  TO anon, authenticated
  WITH CHECK (app_current_user_id() IS NOT NULL);

CREATE POLICY "Session users can delete own response images"
  ON kundrunda_response_images FOR DELETE
  TO anon, authenticated
  USING (uploaded_by = app_current_user_id() OR app_current_user_role() IN ('admin', 'manager'));

-- 6. Seed 5 global common defects for grocery stores
INSERT INTO kundrunda_common_defects (store_id, label, sort_order) VALUES
  (NULL, 'Hylletiketter saknas eller är felaktiga', 0),
  (NULL, 'Golv smutsigt eller behöver rengöring', 1),
  (NULL, 'Kyl/frys: temperaturavvikelse eller issläde', 2),
  (NULL, 'Produkt utgånget datum eller ska plockas bort', 3),
  (NULL, 'Belysning ur funktion (lampbyte behövs)', 4)
ON CONFLICT DO NOTHING;

-- 7. Seed checkpoint descriptions for all existing checkpoints
UPDATE kundrunda_checkpoints SET description =
  CASE label
    WHEN 'Skyltning' THEN 'Kontrollera att alla priskyltar är rätt prissatta, synliga och inte saknas. Kampanjskyltning ska vara aktuell.'
    WHEN 'Städning' THEN 'Kontrollera golv, hyllor och ytor. Inga synliga fläckar, skräp eller damm. Bakom hyllorna ska vara rent.'
    WHEN 'Belysning' THEN 'Alla lampor ska fungera. Inga blinkande eller trasiga lysrör. Kylluckor och frysdiskar ska vara välbelysta.'
    WHEN 'Säljtryck' THEN 'Hyllor ska vara välpåfyllda (minst 80%). Inget hål-i-hyllan. Kampanjprodukter framme och exponerade.'
    ELSE description
  END
WHERE description IS NULL;
