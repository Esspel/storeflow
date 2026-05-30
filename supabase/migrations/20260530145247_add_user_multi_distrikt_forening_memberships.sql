/*
  # Lägg till stöd för flera distrikt och föreningar per användare

  ## Bakgrund
  Idag kan en app_user bara tillhöra ett distrikt (distrikt_id) och en förening (forening_id)
  direkt på app_users-raden. Det stöder inte att en användare (t.ex. en distriktschef)
  kan tillhöra flera distrikt eller föreningar.

  ## Ändringar
  1. Ny tabell `user_foreningar` — kopplingstabellen för användare↔föreningar (M:N)
  2. Ny tabell `user_distrikt` — kopplingstabellen för användare↔distrikt (M:N)
  3. RLS aktiveras på båda tabellerna
  4. Befintliga distrikt_id/forening_id-värden på app_users behålls som primärkoppling
     men kopplas automatiskt in i de nya tabellerna via en backfill
*/

-- ── user_foreningar ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_foreningar (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  forening_id uuid NOT NULL REFERENCES foreningar(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, forening_id)
);

ALTER TABLE user_foreningar ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Session users can read user_foreningar"
  ON user_foreningar FOR SELECT
  TO anon
  USING (app_current_user_id() IS NOT NULL);

CREATE POLICY "Admins can insert user_foreningar"
  ON user_foreningar FOR INSERT
  TO anon
  WITH CHECK (app_current_user_role() IN ('admin', 'manager'));

CREATE POLICY "Admins can delete user_foreningar"
  ON user_foreningar FOR DELETE
  TO anon
  USING (app_current_user_role() IN ('admin', 'manager'));

-- ── user_distrikt ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_distrikt (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  distrikt_id uuid NOT NULL REFERENCES distrikt(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, distrikt_id)
);

ALTER TABLE user_distrikt ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Session users can read user_distrikt"
  ON user_distrikt FOR SELECT
  TO anon
  USING (app_current_user_id() IS NOT NULL);

CREATE POLICY "Admins can insert user_distrikt"
  ON user_distrikt FOR INSERT
  TO anon
  WITH CHECK (app_current_user_role() IN ('admin', 'manager'));

CREATE POLICY "Admins can delete user_distrikt"
  ON user_distrikt FOR DELETE
  TO anon
  USING (app_current_user_role() IN ('admin', 'manager'));

-- ── Backfill befintliga primärkopplingar ─────────────────────────────────────
INSERT INTO user_foreningar (user_id, forening_id, is_primary)
SELECT id, forening_id, true
FROM app_users
WHERE forening_id IS NOT NULL
ON CONFLICT (user_id, forening_id) DO NOTHING;

INSERT INTO user_distrikt (user_id, distrikt_id, is_primary)
SELECT id, distrikt_id, true
FROM app_users
WHERE distrikt_id IS NOT NULL
ON CONFLICT (user_id, distrikt_id) DO NOTHING;

-- ── Index för snabb lookup ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_user_foreningar_user_id ON user_foreningar(user_id);
CREATE INDEX IF NOT EXISTS idx_user_foreningar_forening_id ON user_foreningar(forening_id);
CREATE INDEX IF NOT EXISTS idx_user_distrikt_user_id ON user_distrikt(user_id);
CREATE INDEX IF NOT EXISTS idx_user_distrikt_distrikt_id ON user_distrikt(distrikt_id);
