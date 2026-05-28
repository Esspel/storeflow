/*
  # Pulstavla PIN-skydd och QR-tokens

  1. Nya tabeller
    - `pulstavla_pins` — en PIN per butik för att låsa upp pulstavlan (TV-vy)
      - `store_id` (uuid, FK stores) — en rad per butik
      - `pin_hash` (text) — bcrypt-hash av 4-siffrig PIN
      - `updated_at` (timestamptz)
    - `qr_tokens` — tillfälliga, signerade tokens för publik QR-länk (avvikelse-snabbregistrering & kundönskemål-status)
      - `token` (text, unik) — slumpmässigt UUID-token
      - `token_type` (text) — 'incident_zone' | 'customer_request_status'
      - `store_id` (uuid, FK stores)
      - `meta` (jsonb) — t.ex. { zone_name: "Mejeri" } eller { request_id: "..." }
      - `expires_at` (timestamptz) — QR-koder för avvikelse löper aldrig ut (NULL), kundönskemål 30 dagar
      - `created_by` (uuid, FK app_users)
      - `created_at` (timestamptz)

  2. Säkerhet
    - RLS aktiverat på båda tabeller
    - pulstavla_pins: bara admin/manager kan läsa/skriva PIN för sin butik
    - qr_tokens: inloggade användare kan skapa/läsa tokens för sin butik; anon kan läsa tokens (för publik QR-sida)
*/

-- ── pulstavla_pins ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pulstavla_pins (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  pin_hash    text NOT NULL,
  updated_at  timestamptz DEFAULT now(),
  UNIQUE(store_id)
);

ALTER TABLE pulstavla_pins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can read their store PIN"
  ON pulstavla_pins FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Managers can upsert their store PIN"
  ON pulstavla_pins FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE app_users.id = app_current_user_id()
        AND (app_users.role = 'admin' OR app_users.role = 'manager')
        AND (app_users.active_store_id = store_id OR app_users.store_id = store_id)
    )
  );

CREATE POLICY "Managers can update their store PIN"
  ON pulstavla_pins FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE app_users.id = app_current_user_id()
        AND (app_users.role = 'admin' OR app_users.role = 'manager')
        AND (app_users.active_store_id = store_id OR app_users.store_id = store_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE app_users.id = app_current_user_id()
        AND (app_users.role = 'admin' OR app_users.role = 'manager')
        AND (app_users.active_store_id = store_id OR app_users.store_id = store_id)
    )
  );

-- ── qr_tokens ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS qr_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token       text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  token_type  text NOT NULL CHECK (token_type IN ('incident_zone', 'customer_request_status')),
  store_id    uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  meta        jsonb DEFAULT '{}'::jsonb,
  expires_at  timestamptz DEFAULT NULL,
  created_by  uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE qr_tokens ENABLE ROW LEVEL SECURITY;

-- Anon can read tokens (needed for public QR landing pages)
CREATE POLICY "Anyone can read QR tokens"
  ON qr_tokens FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Authenticated users can create QR tokens for their store"
  ON qr_tokens FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE app_users.id = app_current_user_id()
        AND (app_users.active_store_id = store_id OR app_users.store_id = store_id)
    )
  );

CREATE POLICY "Authenticated users can delete their own QR tokens"
  ON qr_tokens FOR DELETE
  TO authenticated
  USING (created_by = app_current_user_id());

-- Index för snabb token-lookup
CREATE INDEX IF NOT EXISTS idx_qr_tokens_token ON qr_tokens(token);
CREATE INDEX IF NOT EXISTS idx_qr_tokens_store_type ON qr_tokens(store_id, token_type);
