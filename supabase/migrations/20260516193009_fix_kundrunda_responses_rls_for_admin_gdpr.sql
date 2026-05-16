/*
  # Allow admins to read all kundrunda_responses

  ## Problem
  The GDPR export feature requires admins to read kundrunda_responses for any user.
  The current policy restricts reads to sessions conducted by the current user or
  in their stores, which blocks admin GDPR exports for users in other stores.

  ## Fix
  Replace the restrictive policy with one that also allows admins full read access.
*/

DROP POLICY IF EXISTS "Users can view responses for their sessions" ON kundrunda_responses;

CREATE POLICY "Users can view kundrunda responses"
  ON kundrunda_responses FOR SELECT
  TO anon
  USING (
    app_current_user_role() = 'admin'
    OR (
      app_current_user_id() IS NOT NULL
      AND session_id IN (
        SELECT ks.id FROM kundrunda_sessions ks
        WHERE ks.conducted_by = app_current_user_id()
          OR ks.store_id IN (
            SELECT us.store_id FROM user_stores us WHERE us.user_id = app_current_user_id()
          )
      )
    )
  );
