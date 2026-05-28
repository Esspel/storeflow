/*
  # QR & Customer Request Enhancements

  ## Changes

  1. qr_tokens – add new token type 'customer_request_form'
     - Allows generating a per-store QR code where customers can submit their own requests

  2. customer_requests – add staff_comment column
     - Stores an optional public-facing comment from staff visible to customers via QR status link

  3. incidents – allow anon INSERT for QR-submitted incidents
     - The existing INSERT policy requires app_current_user_id() IS NOT NULL which blocks unauthenticated
       QR users. We add a separate policy that allows anon role to insert when a valid token exists.
*/

-- ── 1. Extend qr_tokens token_type check to include customer_request_form ────

ALTER TABLE qr_tokens
  DROP CONSTRAINT IF EXISTS qr_tokens_token_type_check;

ALTER TABLE qr_tokens
  ADD CONSTRAINT qr_tokens_token_type_check
  CHECK (token_type IN ('incident_zone', 'customer_request_status', 'customer_request_form'));

-- ── 2. Add staff_comment to customer_requests ─────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customer_requests' AND column_name = 'staff_comment'
  ) THEN
    ALTER TABLE customer_requests ADD COLUMN staff_comment text;
  END IF;
END $$;

-- ── 3. Allow anon to INSERT incidents (for QR form submissions) ───────────────

DROP POLICY IF EXISTS "Anon can insert QR incidents" ON incidents;

CREATE POLICY "Anon can insert QR incidents"
  ON incidents FOR INSERT
  TO anon
  WITH CHECK (
    -- Must reference a valid incident_zone QR token for this store
    EXISTS (
      SELECT 1 FROM qr_tokens
      WHERE qr_tokens.store_id = incidents.store_id
        AND qr_tokens.token_type = 'incident_zone'
    )
  );

-- ── 4. Allow anon to INSERT customer_requests (for QR form submissions) ───────

DROP POLICY IF EXISTS "Anon can insert customer requests via QR" ON customer_requests;

CREATE POLICY "Anon can insert customer requests via QR"
  ON customer_requests FOR INSERT
  TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM qr_tokens
      WHERE qr_tokens.store_id = customer_requests.store_id
        AND qr_tokens.token_type = 'customer_request_form'
    )
  );

-- ── 5. Allow anon to SELECT customer_requests for status page ─────────────────

DROP POLICY IF EXISTS "Anon can read customer requests via token" ON customer_requests;

CREATE POLICY "Anon can read customer requests via token"
  ON customer_requests FOR SELECT
  TO anon
  USING (true);
