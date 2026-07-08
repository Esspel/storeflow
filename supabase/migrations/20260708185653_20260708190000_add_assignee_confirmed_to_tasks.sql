/*
# Add assignee_confirmed to tasks

## Summary
Adds a nullable boolean column `assignee_confirmed` to the `tasks` table to track
whether a manager has confirmed that the assigned person (individual user, not group)
is still the correct person to perform a recurring task.

## Why
Recurring tasks are often created with an individual user assignee. Because staff
schedules change week to week, the system now prompts managers to re-confirm (or
re-assign) the person before each recurrence. This column tracks that state.

## Changes
- `tasks.assignee_confirmed` (boolean, nullable):
  - NULL  = not applicable (group-assigned or no assignee)
  - FALSE = needs confirmation from manager
  - TRUE  = manager has confirmed (or re-assigned) the person

## No RLS changes needed — tasks table policies already cover this column.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'assignee_confirmed'
  ) THEN
    ALTER TABLE tasks ADD COLUMN assignee_confirmed boolean;
  END IF;
END $$;
