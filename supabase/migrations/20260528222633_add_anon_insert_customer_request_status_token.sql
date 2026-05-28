/*
  # Allow anon to insert customer_request_status QR tokens

  When a customer submits a request via QR, we want to create a status token
  so they can follow their request. The anon user (customer) must be allowed
  to insert a qr_token of type 'customer_request_status' for the same store,
  but only if a valid 'customer_request_form' token exists for that store
  (proving it is a legitimate store with QR forms enabled).
*/

CREATE POLICY "Anon can create status tokens for QR form stores"
  ON qr_tokens FOR INSERT
  TO anon
  WITH CHECK (
    token_type = 'customer_request_status'
    AND EXISTS (
      SELECT 1 FROM qr_tokens existing
      WHERE existing.store_id = qr_tokens.store_id
        AND existing.token_type = 'customer_request_form'
    )
  );
