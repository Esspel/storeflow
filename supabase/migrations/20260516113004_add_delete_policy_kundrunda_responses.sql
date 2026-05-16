/*
  # Add DELETE policy for kundrunda_responses

  ## Problem
  The kundrunda_responses table was missing a DELETE policy, causing deleteSession()
  to silently fail (RLS blocked the delete) when a manager tried to remove a session.

  ## Changes
  - Adds DELETE policy allowing session owners and store members (managers/admins) to
    delete responses belonging to their sessions.
*/

CREATE POLICY "Session owner or store member can delete responses"
  ON kundrunda_responses
  FOR DELETE
  TO anon
  USING (
    app_current_user_id() IS NOT NULL
    AND session_id IN (
      SELECT id FROM kundrunda_sessions
      WHERE conducted_by = app_current_user_id()
        OR store_id IN (
          SELECT store_id FROM user_stores WHERE user_id = app_current_user_id()
        )
    )
  );
