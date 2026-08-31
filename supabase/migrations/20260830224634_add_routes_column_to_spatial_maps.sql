/*
  # Add routes column to spatial_maps

  The `spatial_maps` table stores the active coordinate system for a store
  and includes a `markers` JSONB column. Navigation routes (used by the
  customer-nav and spatial-navigation views) follow the same JSONB pattern
  but the column was never created, causing errors like:

    column spatial_maps.routes does not exist

  This migration adds the column as JSONB with a safe default of an empty
  array, preserving existing rows. It also includes a defensive guard so the
  migration is safe to re-run on installations where the column already
  exists.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'spatial_maps'
      AND column_name = 'routes'
  ) THEN
    ALTER TABLE spatial_maps
      ADD COLUMN routes jsonb NOT NULL DEFAULT '[]'::jsonb;
  END IF;
END $$;
