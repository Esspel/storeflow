/*
  # Meeting Types Table + Shared Common Defects

  ## New Tables
  - `meeting_types`: Stores configurable meeting types (replaces hardcoded array in moten.tsx)
    - `id` (uuid)
    - `value` (text, unique slug, e.g. "daglig_styrning")
    - `label` (text, display name)
    - `description` (text)
    - `default_duration_min` (int, default 30)
    - `default_agenda` (jsonb, array of {title, duration} objects)
    - `sort_order` (int)
    - `is_active` (bool, soft-delete)
    - `created_by` (uuid, FK app_users)
    - `created_at` (timestamptz)

  - `common_defects`: Shared defects table used by BOTH avvikelser and kundrunda
    - `id` (uuid)
    - `store_id` (uuid, null = global HK defect)
    - `label` (text)
    - `sort_order` (int)
    - `created_at` (timestamptz)

  ## Security
  - RLS enabled on both tables
  - meeting_types: authenticated users can read; managers/admins can write
  - common_defects: authenticated users can read; managers/admins can write

  ## Notes
  - Seeds all 9 existing meeting types from moten.tsx hardcoded array
  - common_defects is a NEW shared table separate from kundrunda_common_defects
  - kundrunda_common_defects is left untouched for backward compatibility
*/

-- ─── meeting_types ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS meeting_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  value text UNIQUE NOT NULL,
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  default_duration_min integer NOT NULL DEFAULT 30,
  default_agenda jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE meeting_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meeting_types_select"
  ON meeting_types FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "meeting_types_insert"
  ON meeting_types FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE id = auth.uid()
      AND role IN ('admin', 'manager')
    )
  );

CREATE POLICY "meeting_types_update"
  ON meeting_types FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE id = auth.uid()
      AND role IN ('admin', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE id = auth.uid()
      AND role IN ('admin', 'manager')
    )
  );

CREATE POLICY "meeting_types_delete"
  ON meeting_types FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE id = auth.uid()
      AND role = 'admin'
    )
  );

-- ─── Seed meeting types from moten.tsx ───────────────────────────────────────

INSERT INTO meeting_types (value, label, description, default_duration_min, default_agenda, sort_order) VALUES
('daglig_styrning', 'Daglig styrning', 'Daglig uppföljning mån–fre kl 09:30, 15 min. Genomgång av StoreFlow-tavlan.', 15,
 '[{"title":"Pulstavlan (StoreFlow) — öppna uppgifter & avvikelser","duration":5},{"title":"Igår — vad gick bra / vad gick dåligt?","duration":5},{"title":"Dagens prioriteringar & bemanning","duration":5}]'::jsonb, 0),
('ledningsgrupp', 'Ledningsgrupp', 'Veckogenomgång för ledningsgruppen. Fredag 13:00, 60 min. Schema via SoftOne GO.', 60,
 '[{"title":"Föregående protokoll — uppföljning av beslut","duration":5},{"title":"Försäljning & budget (CAP / Power BI)","duration":15},{"title":"Personal, schema & SoftOne GO","duration":10},{"title":"Avvikelser & incidenter (StoreFlow)","duration":10},{"title":"Kommande kampanjer (Open Access / Coopnet)","duration":10},{"title":"Beslut & åtgärder","duration":10}]'::jsonb, 1),
('saljledare', 'Säljledarmöte', 'Månadsvis säljledaremöte. Första måndag 13:00, 60 min.', 60,
 '[{"title":"Månadsresultat per avdelning (CAP)","duration":15},{"title":"Kampanjplanering & Open Access-aktiveringar","duration":15},{"title":"Sortimentsfrågor — Mitt Coop / SAP FnR / A3 (kommande)","duration":10},{"title":"Kundtrender (Scan & Pay, Coop-appen)","duration":10},{"title":"Beslut","duration":10}]'::jsonb, 2),
('personalmote', 'Personalmöte', 'Butiksmöte med all personal. Genomgång av nyheter från Relesys (kommunikationskanal) och Coopnet, kampanjer och arbetsmiljö.', 45,
 '[{"title":"Nyheter från Relesys (kommunikationskanal) & Coopnet (intranät)","duration":10},{"title":"Försäljning & butikens resultat","duration":10},{"title":"Kampanjer & aktiviteter kommande period","duration":10},{"title":"Attensi Skills — utbildningsstatus","duration":5},{"title":"Arbetsmiljö & IA-systemet — avvikelser","duration":5},{"title":"Frågor & svar","duration":5}]'::jsonb, 3),
('haccp', 'HACCP / Livsmedelssäkerhet', 'Månadsvis HACCP-uppföljning. Egenkontroll via GetCompliant, temperaturloggar.', 30,
 '[{"title":"Temperaturloggar kyl & frys (RDM / Danfoss)","duration":5},{"title":"GetCompliant — egenkontrollstatus sedan sist","duration":10},{"title":"Datumkontroll (Upshop) — avvikelser","duration":5},{"title":"Rengöring & hygien — avvikelser från kundrundan","duration":5},{"title":"Åtgärder & uppföljning","duration":5}]'::jsonb, 4),
('frankly', '&frankly — Medarbetarenkät', 'Genomgång av &frankly-resultat. Halvårsvis, 45 min.', 45,
 '[{"title":"Presentation av &frankly-resultat","duration":10},{"title":"Analys — vad är bra, vad behöver förbättras?","duration":15},{"title":"Jämförelse mot föregående period","duration":5},{"title":"Prioriterade förbättringsområden","duration":10},{"title":"Åtgärdsplan & ansvariga (StoreFlow-uppgifter)","duration":5}]'::jsonb, 5),
('cap_genomgang', 'CAP / KPI-genomgång', 'Genomgång av Power BI-rapporter från CAP (Coop Analytical Platform).', 30,
 '[{"title":"Försäljning vs. budget (Power BI)","duration":10},{"title":"Svinn & kassation per avdelning","duration":5},{"title":"CAO-avvikelser (SAP / Blue Yonder / JDA)","duration":5},{"title":"Åtgärder utifrån data","duration":10}]'::jsonb, 6),
('leverans_genomgang', 'Leveransgenomgång', 'Uppföljning av leveranser, CAO-avvikelser (SAP/Blue Yonder) och returer.', 20,
 '[{"title":"Leveransplan — avvikelser mot CAO (SAP FnR)","duration":5},{"title":"Kvalitetsreklamationer & returer (Tomra / leverantör)","duration":5},{"title":"Svinn & markdowns","duration":5},{"title":"Åtgärder & uppföljning","duration":5}]'::jsonb, 7),
('veckostamning', 'Veckoavstämning', 'Flexibel veckovis uppstämning.', 30,
 '[{"title":"Veckans mål","duration":5},{"title":"Uppföljning","duration":10},{"title":"Kommande vecka","duration":10},{"title":"Övrigt","duration":5}]'::jsonb, 8)
ON CONFLICT (value) DO NOTHING;

-- ─── common_defects (shared between avvikelser + kundrunda) ──────────────────

CREATE TABLE IF NOT EXISTS common_defects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES stores(id) ON DELETE CASCADE,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS common_defects_store_id_idx ON common_defects(store_id);

ALTER TABLE common_defects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "common_defects_select"
  ON common_defects FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "common_defects_insert"
  ON common_defects FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE id = auth.uid()
      AND role IN ('admin', 'manager')
    )
  );

CREATE POLICY "common_defects_update"
  ON common_defects FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE id = auth.uid()
      AND role IN ('admin', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE id = auth.uid()
      AND role IN ('admin', 'manager')
    )
  );

CREATE POLICY "common_defects_delete"
  ON common_defects FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE id = auth.uid()
      AND role IN ('admin', 'manager')
    )
  );
