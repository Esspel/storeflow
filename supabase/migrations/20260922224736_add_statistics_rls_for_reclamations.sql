/*
  Migration: Add statistics-read policy for reclamations so all-store
  statistics (ersättningscheck survey) can access data beyond active store.
  Keeps per-store mutation policies intact.
*/

-- Allow SELECT for statistics (all stores) when user is admin or statistics role
DROP POLICY IF EXISTS "reclamations_statistics_select" ON public.reclamations;

CREATE POLICY "reclamations_statistics_select"
  ON public.reclamations FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (SELECT 1 FROM app_users WHERE id = app_current_user_id() AND role = 'admin')
    OR store_id = app_current_store_id()
  );
