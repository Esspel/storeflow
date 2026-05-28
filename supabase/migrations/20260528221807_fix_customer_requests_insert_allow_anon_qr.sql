/*
  # Fix customer_requests INSERT policy for anon QR submissions

  Same dual-policy problem as incidents: the `customer_requests_insert` policy
  applies to anon role and requires app_current_user_id() to match a user_store.
  For anon users this always fails, blocking QR form submissions.

  Fix: add an escape hatch so unauthenticated users (anon) can pass through the
  general insert policy when they also satisfy the QR token check.
*/

DROP POLICY IF EXISTS "customer_requests_insert" ON customer_requests;

CREATE POLICY "customer_requests_insert"
  ON customer_requests FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    (
      app_current_user_id() IS NOT NULL
      AND (
        EXISTS (
          SELECT 1 FROM user_stores
          WHERE user_stores.store_id = customer_requests.store_id
            AND user_stores.user_id = app_current_user_id()
        )
        OR EXISTS (
          SELECT 1 FROM app_users
          WHERE app_users.id = app_current_user_id()
            AND app_users.role = 'admin'
        )
      )
    )
    OR (
      app_current_user_id() IS NULL
      AND EXISTS (
        SELECT 1 FROM qr_tokens
        WHERE qr_tokens.store_id = customer_requests.store_id
          AND qr_tokens.token_type = 'customer_request_form'
      )
    )
  );
