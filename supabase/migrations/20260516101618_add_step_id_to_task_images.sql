/*
  # Add step_id to task_images

  ## Summary
  Adds an optional `step_id` column to `task_images` to allow images to be
  associated with a specific task step (when `requires_photo = true`).
  If null, the image is a general task attachment.

  ## Changes
  - `task_images.step_id` (uuid, nullable, FK to task_steps.id ON DELETE SET NULL)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_images' AND column_name = 'step_id'
  ) THEN
    ALTER TABLE task_images ADD COLUMN step_id uuid REFERENCES task_steps(id) ON DELETE SET NULL;
  END IF;
END $$;
