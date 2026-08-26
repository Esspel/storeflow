-- Fix to apply spatial tables SQL to existing schema
-- This script updates the existing schema to match the spatial_tables migration
-- Note: Should be run AFTER 20260823150000_create_spatial_tables.sql

-- First, update the existing shelf_planograms table to match spatial_tables requirements
DO $$
BEGIN
  -- Add required columns if they don't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shelf_planograms' AND column_name = 'shelf_marker_id'
  ) THEN
    ALTER TABLE shelf_planograms ADD COLUMN shelf_marker_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shelf_planograms' AND column_name = 'expected_products'
  ) THEN
    ALTER TABLE shelf_planograms ADD COLUMN expected_products jsonb NOT NULL DEFAULT '[]'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shelf_planograms' AND column_name = 'version'
  ) THEN
    ALTER TABLE shelf_planograms ADD COLUMN version integer NOT NULL DEFAULT 1;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shelf_planograms' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE shelf_planograms ADD COLUMN is_active boolean NOT NULL DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shelf_planograms' AND column_name = 'pdf_storage_path'
  ) THEN
    ALTER TABLE shelf_planograms ADD COLUMN pdf_storage_path text;
  END IF;
END $$;

-- Create planogram_pdfs table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'planogram_pdfs'
    AND table_schema = 'public'
  ) THEN
    CREATE TABLE planogram_pdfs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      planogram_id uuid NOT NULL
        REFERENCES shelf_planograms(id)
        ON DELETE CASCADE,
      storage_path text NOT NULL,
      original_filename text NOT NULL,
      file_size_bytes bigint,
      uploaded_by uuid
        REFERENCES app_users(id)
        ON DELETE SET NULL,
      uploaded_at timestamptz NOT NULL DEFAULT now()
    );
  END IF;
END $$;

-- Enable RLS on planogram_pdfs
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'planogram_pdfs' AND table_schema = 'public') THEN
    ALTER TABLE planogram_pdfs ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Create RLS policies for planogram_pdfs
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'planogram_pdfs' AND table_schema = 'public') THEN
    -- Drop policy if exists
    EXECUTE 'DROP POLICY IF EXISTS "planogram_pdfs_select" ON planogram_pdfs';

    -- Create new policy
    EXECUTE '
      CREATE POLICY "planogram_pdfs_select" ON planogram_pdfs
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM shelf_planograms sp
          WHERE sp.id = planogram_pdfs.planogram_id
            AND (
              sp.store_id = (
                SELECT store_id
                FROM app_users
                WHERE id = auth.uid()
              )
              OR sp.store_id = (
                SELECT active_store_id
                FROM app_users
                WHERE id = auth.uid()
              )
              OR EXISTS (
                SELECT 1 FROM app_users
                WHERE id = auth.uid()
                  AND role = \'admin\'
              )
            )
        )
      );
    ';
  END IF;
END $$;

-- Create indexes
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shelf_planograms' AND table_schema = 'public') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_shelf_planograms_store ON shelf_planograms(store_id, is_active)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_shelf_planograms_marker ON shelf_planograms(shelf_marker_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_shelf_planograms_products ON shelf_planograms USING gin(expected_products)';
  END IF;
END $$;

-- Update spatial_markers table to include new fields for planogram integration
DO $$
BEGIN
  -- Add marker_type column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'spatial_markers' AND column_name = 'marker_type'
  ) THEN
    ALTER TABLE spatial_markers ADD COLUMN marker_type text CHECK (marker_type IN ('aruco', 'qr', 'entrance', 'exit')) NOT NULL;
  END IF;

  -- Add marker_id column for ArUco/QR content
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'spatial_markers' AND column_name = 'marker_id'
  ) THEN
    ALTER TABLE spatial_markers ADD COLUMN marker_id text NOT NULL;
  END IF;

  -- Add aruco_id column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'spatial_markers' AND column_name = 'aruco_id'
  ) THEN
    ALTER TABLE spatial_markers ADD COLUMN aruco_id integer;
  END IF;

  -- Add qr_content column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'spatial_markers' AND column_name = 'qr_content'
  ) THEN
    ALTER TABLE spatial_markers ADD COLUMN qr_content text;
  END IF;

  -- Add shelf_id column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'spatial_markers' AND column_name = 'shelf_id'
  ) THEN
    ALTER TABLE spatial_markers ADD COLUMN shelf_id text;
  END IF;

  -- Add shelf_name column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'spatial_markers' AND column_name = 'shelf_name'
  ) THEN
    ALTER TABLE spatial_markers ADD COLUMN shelf_name text;
  END IF;
END $$;

-- Update spatial_routes table if needed
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'spatial_routes' AND table_schema = 'public') THEN
    -- Add missing columns to spatial_routes if needed
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'spatial_routes' AND column_name = 'distance_meters'
    ) THEN
      ALTER TABLE spatial_routes ADD COLUMN distance_meters double precision NOT NULL;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'spatial_routes' AND column_name = 'path'
    ) THEN
      ALTER TABLE spatial_routes ADD COLUMN path text[] NOT NULL DEFAULT '{}';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'spatial_routes' AND column_name = 'route_type'
    ) THEN
      ALTER TABLE spatial_routes ADD COLUMN route_type text CHECK (route_type IN ('walking', 'cart', 'accessible')) DEFAULT 'walking';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'spatial_routes' AND column_name = 'created_at'
    ) THEN
      ALTER TABLE spatial_routes ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
    END IF;

    -- Add unique constraint
    EXECUTE 'DO $$ BEGIN EXECUTE \'ALTER TABLE spatial_routes DROP CONSTRAINT IF EXISTS unique_spatial_routes\'; END$$';  -- Drop if exists
    EXECUTE 'ALTER TABLE spatial_routes ADD CONSTRAINT unique_spatial_routes UNIQUE (map_id, from_marker_id, to_marker_id, route_type)';
  END IF;
END $$;

-- Update spatial_tasks table if needed
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'spatial_tasks' AND table_schema = 'public') THEN
    -- Add required columns
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'spatial_tasks' AND column_name = 'task_type'
    ) THEN
      ALTER TABLE spatial_tasks ADD COLUMN task_type text CHECK (task_type IN ('restock', 'price_check', 'planogram_fix', 'cleanup', 'audit', 'other')) NOT NULL;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'spatial_tasks' AND column_name = 'priority'
    ) THEN
      ALTER TABLE spatial_tasks ADD COLUMN priority text CHECK (priority IN ('low', 'medium', 'high', 'urgent')) DEFAULT 'medium';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'spatial_tasks' AND column_name = 'status'
    ) THEN
      ALTER TABLE spatial_tasks ADD COLUMN status text CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')) DEFAULT 'pending';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'spatial_tasks' AND column_name = 'due_at'
    ) THEN
      ALTER TABLE spatial_tasks ADD COLUMN due_at timestamptz;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'spatial_tasks' AND column_name = 'completed_at'
    ) THEN
      ALTER TABLE spatial_tasks ADD COLUMN completed_at timestamptz;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'spatial_tasks' AND column_name = 'metadata'
    ) THEN
      ALTER TABLE spatial_tasks ADD COLUMN metadata jsonb DEFAULT '{}'::jsonb;
    END IF;
  END IF;
END $$;

-- Update staff_positions table if needed
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'staff_positions' AND table_schema = 'public') THEN
    -- Add missing columns
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'staff_positions' AND column_name = 'nearest_marker_id'
    ) THEN
      ALTER TABLE staff_positions ADD COLUMN nearest_marker_id uuid REFERENCES spatial_markers(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'staff_positions' AND column_name = 'confidence'
    ) THEN
      ALTER TABLE staff_positions ADD COLUMN confidence double precision DEFAULT 1.0;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'staff_positions' AND column_name = 'tracking_method'
    ) THEN
      ALTER TABLE staff_positions ADD COLUMN tracking_method text CHECK (tracking_method IN ('camera', 'marker', 'manual', 'fused')) DEFAULT 'marker';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'staff_positions' AND column_name = 'recorded_at'
    ) THEN
      ALTER TABLE staff_positions ADD COLUMN recorded_at timestamptz NOT NULL DEFAULT now();
    END IF;
  END IF;
END $$;

-- Update product_locations table if needed
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'product_locations' AND table_schema = 'public') THEN
    -- Add missing columns
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'product_locations' AND column_name = 'shelf_position'
    ) THEN
      ALTER TABLE product_locations ADD COLUMN shelf_position jsonb;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'product_locations' AND column_name = 'facings'
    ) THEN
      ALTER TABLE product_locations ADD COLUMN facings int DEFAULT 1;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'product_locations' AND column_name = 'is_primary'
    ) THEN
      ALTER TABLE product_locations ADD COLUMN is_primary boolean DEFAULT false;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'product_locations' AND column_name = 'created_at'
    ) THEN
      ALTER TABLE product_locations ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'product_locations' AND column_name = 'updated_at'
    ) THEN
      ALTER TABLE product_locations ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
    END IF;

    -- Add unique constraint
    EXECUTE 'DO $$ BEGIN EXECUTE \'ALTER TABLE product_locations DROP CONSTRAINT IF EXISTS unique_product_locations\'; END$$';  -- Drop if exists
    EXECUTE 'ALTER TABLE product_locations ADD CONSTRAINT unique_product_locations UNIQUE (store_id, product_id, marker_id)';
  END IF;
END $$;