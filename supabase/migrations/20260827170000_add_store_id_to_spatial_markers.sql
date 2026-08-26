-- Add store_id to spatial_markers for store isolation
-- Created: 2026-08-27

-- Add store_id column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'spatial_markers' AND column_name = 'store_id'
  ) THEN
    ALTER TABLE spatial_markers
      ADD COLUMN store_id uuid REFERENCES stores(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_spatial_markers_store ON spatial_markers(store_id);