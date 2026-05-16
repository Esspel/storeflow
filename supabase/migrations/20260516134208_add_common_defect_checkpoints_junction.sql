/*
  # Add multi-checkpoint linking for common defects

  1. New Tables
    - `kundrunda_defect_checkpoints` - Junction table linking common defects to multiple checkpoints
      - `defect_id` (uuid, FK → kundrunda_common_defects)
      - `checkpoint_id` (uuid, FK → kundrunda_checkpoints)
      - PRIMARY KEY (defect_id, checkpoint_id)

  2. Data Migration
    - Migrate existing checkpoint_id values to the new junction table

  3. Notes
    - The old `checkpoint_id` column on `kundrunda_common_defects` is kept for backward compatibility
      but the junction table is the source of truth going forward
    - NULL checkpoint_id on a defect means it applies to all checkpoints (global)
*/

CREATE TABLE IF NOT EXISTS kundrunda_defect_checkpoints (
  defect_id uuid NOT NULL REFERENCES kundrunda_common_defects(id) ON DELETE CASCADE,
  checkpoint_id uuid NOT NULL REFERENCES kundrunda_checkpoints(id) ON DELETE CASCADE,
  PRIMARY KEY (defect_id, checkpoint_id)
);

ALTER TABLE kundrunda_defect_checkpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read defect checkpoints"
  ON kundrunda_defect_checkpoints FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert defect checkpoints"
  ON kundrunda_defect_checkpoints FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete defect checkpoints"
  ON kundrunda_defect_checkpoints FOR DELETE
  TO authenticated
  USING (true);

-- Migrate existing single checkpoint_id links to junction table
INSERT INTO kundrunda_defect_checkpoints (defect_id, checkpoint_id)
SELECT id, checkpoint_id
FROM kundrunda_common_defects
WHERE checkpoint_id IS NOT NULL
ON CONFLICT DO NOTHING;
