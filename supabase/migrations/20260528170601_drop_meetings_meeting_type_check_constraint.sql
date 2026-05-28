/*
  # Drop restrictive meeting_type CHECK constraint from meetings table

  ## Problem
  The meetings table has a CHECK constraint limiting meeting_type to four hardcoded
  values. The system now uses a dynamic meeting_types table with custom values
  (e.g. 'custom_xxx_123456789'), so any meeting created with a custom type fails
  the constraint and is silently rejected by Supabase.

  ## Changes
  - Drop the CHECK constraint on meetings.meeting_type
  - The meeting_types table already enforces valid types at the application layer
*/

ALTER TABLE meetings
  DROP CONSTRAINT IF EXISTS meetings_meeting_type_check;
