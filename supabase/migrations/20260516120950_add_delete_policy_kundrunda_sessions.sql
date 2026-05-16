/*
  # Add DELETE policy for kundrunda_sessions

  ## Problem
  The kundrunda_sessions table was missing a DELETE RLS policy entirely,
  causing all deletion attempts to silently fail. The deleteSession() function
  in kundrunda.tsx calls:
    1. kundrunda_response_images.delete()   → policy exists (OK)
    2. kundrunda_responses.delete()         → policy exists (OK)
    3. kundrunda_sessions.delete()          → NO POLICY → silently blocked

  ## Fix
  Add a DELETE policy matching the same pattern as other kundrunda policies:
  - Uses app_current_user_id() (session-token based auth, TO anon)
  - Allows session owner (conducted_by) OR any store member (manager/admin)
    to delete a session for their store
*/

CREATE POLICY "Session owner or store member can delete session"
  ON kundrunda_sessions
  FOR DELETE
  TO anon
  USING (
    app_current_user_id() IS NOT NULL
    AND (
      conducted_by = app_current_user_id()
      OR store_id IN (
        SELECT store_id FROM user_stores
        WHERE user_id = app_current_user_id()
      )
    )
  );
