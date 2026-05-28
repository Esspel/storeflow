/*
  # Kundönskemål — Customer Product Requests

  Employees can register customer product requests with product name and/or
  SAP article number (for linking to Mitt Coop catalog).

  ## New Table: customer_requests
  - id: UUID primary key
  - store_id: which store the request belongs to
  - product_name: free-text product name (required)
  - article_number: SAP/Mitt Coop article number (optional)
  - notes: optional free-text notes or customer comment
  - requested_by: app_users.id of employee who registered it
  - status: open | ordered | declined | fulfilled
  - priority: low | normal | high
  - created_at: timestamp

  ## Security
  - RLS enabled
  - All store members can read their store's requests
  - Any authenticated user can insert for their store
  - Managers/admins can update status and delete
*/

CREATE TABLE IF NOT EXISTS customer_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_name text NOT NULL,
  article_number text,
  notes text,
  requested_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'ordered', 'declined', 'fulfilled')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_requests_store_id ON customer_requests(store_id);
CREATE INDEX IF NOT EXISTS idx_customer_requests_status ON customer_requests(status);
CREATE INDEX IF NOT EXISTS idx_customer_requests_created_at ON customer_requests(created_at DESC);

ALTER TABLE customer_requests ENABLE ROW LEVEL SECURITY;

-- Any user belonging to the store can read its requests
CREATE POLICY "customer_requests_select"
  ON customer_requests FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_stores
      WHERE user_stores.store_id = customer_requests.store_id
        AND user_stores.user_id = app_current_user_id()
    )
    OR EXISTS (
      SELECT 1 FROM app_users
      WHERE id = app_current_user_id()
        AND role = 'admin'
    )
  );

-- Any authenticated user can submit a request for their store
CREATE POLICY "customer_requests_insert"
  ON customer_requests FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_stores
      WHERE user_stores.store_id = customer_requests.store_id
        AND user_stores.user_id = app_current_user_id()
    )
    OR EXISTS (
      SELECT 1 FROM app_users
      WHERE id = app_current_user_id()
        AND role = 'admin'
    )
  );

-- Managers and admins can update status/notes
CREATE POLICY "customer_requests_update"
  ON customer_requests FOR UPDATE
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE id = app_current_user_id()
        AND role IN ('admin', 'manager')
        AND is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE id = app_current_user_id()
        AND role IN ('admin', 'manager')
        AND is_active = true
    )
  );

-- Managers and admins can delete
CREATE POLICY "customer_requests_delete"
  ON customer_requests FOR DELETE
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE id = app_current_user_id()
        AND role IN ('admin', 'manager')
        AND is_active = true
    )
  );
