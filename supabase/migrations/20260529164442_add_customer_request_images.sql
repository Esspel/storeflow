/*
  # Add customer_request_images table and anon storage read policy

  ## New Tables
  - `customer_request_images`
    - `id` (uuid, pk)
    - `request_id` (uuid, fk → customer_requests, CASCADE delete)
    - `storage_path` (text) — path in the attachments bucket
    - `uploaded_by` (uuid, nullable) — null for anonymous (QR form) uploads
    - `created_at` (timestamptz)

  ## Security
  - RLS enabled with policies for anon INSERT, authenticated INSERT/SELECT/DELETE
  - Anyone can SELECT (images are public via bucket; anon customers see their uploads)
  - New storage SELECT policy so anon can read customer-requests/ paths
*/

CREATE TABLE IF NOT EXISTS customer_request_images (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id   uuid NOT NULL REFERENCES customer_requests(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  uploaded_by  uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE customer_request_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can insert customer request images"
  ON customer_request_images FOR INSERT
  TO anon
  WITH CHECK (uploaded_by IS NULL);

CREATE POLICY "Authenticated users can insert customer request images"
  ON customer_request_images FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can read customer request images"
  ON customer_request_images FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete customer request images"
  ON customer_request_images FOR DELETE
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_customer_request_images_request_id
  ON customer_request_images(request_id);

-- Allow anon to read attachments in the customer-requests/ folder
-- (bucket is public but existing SELECT policy requires app_current_user_id)
CREATE POLICY "Anon can read customer request attachments"
  ON storage.objects FOR SELECT
  TO anon
  USING (bucket_id = 'attachments' AND name LIKE 'customer-requests/%');
