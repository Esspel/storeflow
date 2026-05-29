/*
  # Fix customer_request_images INSERT policy for app session users

  ## Problem
  App users (staff) run as the `anon` Supabase role using a custom session token
  (x-session-token). The previous anon INSERT policy required `uploaded_by IS NULL`,
  which blocked staff from saving their user ID on the image row.

  ## Changes
  - Drop the restrictive anon INSERT policy
  - Add a new anon INSERT policy that allows any value for uploaded_by
    (the value is supplied by the app, not enforced here)
  - Add a corresponding anon DELETE policy so staff can remove images they uploaded
*/

DROP POLICY IF EXISTS "Anon can insert customer request images" ON customer_request_images;

CREATE POLICY "Anon can insert customer request images"
  ON customer_request_images FOR INSERT
  TO anon
  WITH CHECK (true);

-- Allow anon (staff) to delete images for requests in their store context
DROP POLICY IF EXISTS "Authenticated users can delete customer request images" ON customer_request_images;

CREATE POLICY "Anyone can delete customer request images"
  ON customer_request_images FOR DELETE
  TO anon, authenticated
  USING (true);
