/*
  # Spatial Computing Tables for posemesh integration

  These tables support:
  - Marker-based spatial mapping (ArUco/QR)
  - Shelf planogram compliance
  - Spatial task management
  - Indoor navigation/routing
  - Staff positioning analytics
*/

-- Enable PostGIS for geometric operations (if available)
-- CREATE EXTENSION IF NOT EXISTS postgis;

-- Custom composite types for 3D vectors
-- Must be created in separate transaction to be visible to subsequent statements
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vector3') THEN
    CREATE TYPE vector3 AS (
      x double precision,
      y double precision,
      z double precision
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'quaternion') THEN
    CREATE TYPE quaternion AS (
      x double precision,
      y double precision,
      z double precision,
      w double precision
    );
  END IF;
END $$;

/*
  # Spatial Maps
  A spatial map is a coordinate system for a store containing positioned markers
*/
CREATE TABLE IF NOT EXISTS spatial_maps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  version int DEFAULT 1,
  is_active boolean DEFAULT true,
  -- Origin marker defines the coordinate system (0,0,0)
  origin_marker_id uuid, -- references spatial_markers.id (self-ref after both exist)
  -- Map bounds for quick spatial queries
  bounds_min vector3,
  bounds_max vector3,
  created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE spatial_maps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "spatial_maps_select" ON spatial_maps
  FOR SELECT USING (
    store_id = (SELECT store_id FROM app_users WHERE id = auth.uid())
    OR store_id = (SELECT active_store_id FROM app_users WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "spatial_maps_manage" ON spatial_maps
  FOR ALL USING (
    store_id = (SELECT store_id FROM app_users WHERE id = auth.uid())
    OR store_id = (SELECT active_store_id FROM app_users WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE INDEX IF NOT EXISTS idx_spatial_maps_store ON spatial_maps(store_id, is_active);

/*
  # Spatial Markers
  Individual markers (ArUco/QR) positioned in 3D space within a map
*/
CREATE TABLE IF NOT EXISTS spatial_markers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id uuid REFERENCES spatial_maps(id) ON DELETE CASCADE,
  marker_type text CHECK (marker_type IN ('aruco', 'qr', 'entrance', 'exit')) NOT NULL,
  marker_id text NOT NULL, -- ArUco ID (integer as string) or QR code content
  -- 3D position relative to map origin
  position vector3 NOT NULL,
  -- 3D rotation as quaternion
  rotation quaternion NOT NULL DEFAULT (0, 0, 0, 1),
  -- Flexible metadata for different marker roles
  metadata jsonb DEFAULT '{}'::jsonb,
  -- Visual properties for AR rendering
  size_meters double precision DEFAULT 0.1,
  color text DEFAULT '#FF0000',
  -- Status
  is_active boolean DEFAULT true,
  confidence double precision DEFAULT 1.0,
  created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (map_id, marker_type, marker_id)
);

ALTER TABLE spatial_markers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "spatial_markers_select" ON spatial_markers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM spatial_maps sm
      WHERE sm.id = spatial_markers.map_id
      AND (
        sm.store_id = (SELECT store_id FROM app_users WHERE id = auth.uid())
        OR sm.store_id = (SELECT active_store_id FROM app_users WHERE id = auth.uid())
        OR EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin')
      )
    )
  );

CREATE POLICY "spatial_markers_manage" ON spatial_markers
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM spatial_maps sm
      WHERE sm.id = spatial_markers.map_id
      AND (
        sm.store_id = (SELECT store_id FROM app_users WHERE id = auth.uid())
        OR sm.store_id = (SELECT active_store_id FROM app_users WHERE id = auth.uid())
        OR EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin')
      )
    )
  );

CREATE INDEX IF NOT EXISTS idx_spatial_markers_map ON spatial_markers(map_id);
CREATE INDEX IF NOT EXISTS idx_spatial_markers_type ON spatial_markers(marker_type);
CREATE INDEX IF NOT EXISTS idx_spatial_markers_lookup ON spatial_markers(map_id, marker_type, marker_id);

/*
  # Shelf Planograms (extends existing shelf_planograms if exists)
  Expected product positions on shelves for compliance checking
*/
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'shelf_planograms'
  ) THEN
    CREATE TABLE shelf_planograms (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      store_id uuid REFERENCES stores(id) ON DELETE CASCADE,
      shelf_marker_id uuid REFERENCES spatial_markers(id) ON DELETE SET NULL,
      name text NOT NULL,
      expected_products jsonb NOT NULL DEFAULT '[]'::jsonb,
      version int DEFAULT 1,
      is_active boolean DEFAULT true,
      created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
      updated_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
  END IF;
END $$;

ALTER TABLE shelf_planograms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shelf_planograms_select" ON shelf_planograms
  FOR SELECT USING (
    store_id = (SELECT store_id FROM app_users WHERE id = auth.uid())
    OR store_id = (SELECT active_store_id FROM app_users WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "shelf_planograms_manage" ON shelf_planograms
  FOR ALL USING (
    store_id = (SELECT store_id FROM app_users WHERE id = auth.uid())
    OR store_id = (SELECT active_store_id FROM app_users WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE INDEX IF NOT EXISTS idx_shelf_planograms_store ON shelf_planograms(store_id, is_active);
CREATE INDEX IF NOT EXISTS idx_shelf_planograms_marker ON shelf_planograms(shelf_marker_id);

/*
  # Shelf Observations
  Real-time shelf scans with detected products vs expected planogram
*/
CREATE TABLE IF NOT EXISTS shelf_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES stores(id) ON DELETE CASCADE,
  planogram_id uuid REFERENCES shelf_planograms(id) ON DELETE CASCADE,
  -- Observed products with positions and confidence
  observed_products jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Compliance score 0-100
  compliance_score numeric(5,2) DEFAULT 0,
  -- Products in planogram but not observed
  missing_products text[] DEFAULT '{}',
  -- Products observed at wrong position
  misplaced_products jsonb DEFAULT '[]'::jsonb,
  -- Extra products not in planogram
  extra_products jsonb DEFAULT '[]'::jsonb,
  -- Scan metadata
  captured_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  capture_method text CHECK (capture_method IN ('camera', 'manual', 'hybrid')) DEFAULT 'camera',
  device_info jsonb,
  captured_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE shelf_observations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shelf_observations_select" ON shelf_observations
  FOR SELECT USING (
    store_id = (SELECT store_id FROM app_users WHERE id = auth.uid())
    OR store_id = (SELECT active_store_id FROM app_users WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "shelf_observations_insert" ON shelf_observations
  FOR INSERT WITH CHECK (
    store_id = (SELECT store_id FROM app_users WHERE id = auth.uid())
    OR store_id = (SELECT active_store_id FROM app_users WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE INDEX IF NOT EXISTS idx_shelf_observations_store ON shelf_observations(store_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_shelf_observations_planogram ON shelf_observations(planogram_id, captured_at DESC);

/*
  # Spatial Tasks
  Tasks anchored to specific marker locations
*/
CREATE TABLE IF NOT EXISTS spatial_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES stores(id) ON DELETE CASCADE,
  anchor_marker_id uuid REFERENCES spatial_markers(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  task_type text CHECK (task_type IN ('restock', 'price_check', 'planogram_fix', 'cleanup', 'audit', 'other')) NOT NULL,
  priority text CHECK (priority IN ('low', 'medium', 'high', 'urgent')) DEFAULT 'medium',
  assigned_to uuid REFERENCES app_users(id) ON DELETE SET NULL,
  status text CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')) DEFAULT 'pending',
  due_at timestamptz,
  completed_at timestamptz,
  -- Task-specific data
  metadata jsonb DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE spatial_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "spatial_tasks_select" ON spatial_tasks
  FOR SELECT USING (
    store_id = (SELECT store_id FROM app_users WHERE id = auth.uid())
    OR store_id = (SELECT active_store_id FROM app_users WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin')
    OR assigned_to = auth.uid()
  );

CREATE POLICY "spatial_tasks_manage" ON spatial_tasks
  FOR ALL USING (
    store_id = (SELECT store_id FROM app_users WHERE id = auth.uid())
    OR store_id = (SELECT active_store_id FROM app_users WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE INDEX IF NOT EXISTS idx_spatial_tasks_store ON spatial_tasks(store_id, status);
CREATE INDEX IF NOT EXISTS idx_spatial_tasks_marker ON spatial_tasks(anchor_marker_id);
CREATE INDEX IF NOT EXISTS idx_spatial_tasks_assigned ON spatial_tasks(assigned_to, status);

/*
  # Spatial Routes
  Pre-computed navigation routes between markers
*/
CREATE TABLE IF NOT EXISTS spatial_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id uuid REFERENCES spatial_maps(id) ON DELETE CASCADE,
  from_marker_id uuid REFERENCES spatial_markers(id) ON DELETE CASCADE,
  to_marker_id uuid REFERENCES spatial_markers(id) ON DELETE CASCADE,
  distance_meters double precision NOT NULL,
  -- Path as array of marker IDs
  path text[] NOT NULL DEFAULT '{}',
  -- Route type
  route_type text CHECK (route_type IN ('walking', 'cart', 'accessible')) DEFAULT 'walking',
  created_at timestamptz DEFAULT now(),
  UNIQUE (map_id, from_marker_id, to_marker_id, route_type)
);

ALTER TABLE spatial_routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "spatial_routes_select" ON spatial_routes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM spatial_maps sm
      WHERE sm.id = spatial_routes.map_id
      AND (
        sm.store_id = (SELECT store_id FROM app_users WHERE id = auth.uid())
        OR sm.store_id = (SELECT active_store_id FROM app_users WHERE id = auth.uid())
        OR EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin')
      )
    )
  );

CREATE INDEX IF NOT EXISTS idx_spatial_routes_map ON spatial_routes(map_id);
CREATE INDEX IF NOT EXISTS idx_spatial_routes_from ON spatial_routes(from_marker_id);
CREATE INDEX IF NOT EXISTS idx_spatial_routes_to ON spatial_routes(to_marker_id);

/*
  # Staff Positions (for real-time positioning analytics)
*/
CREATE TABLE IF NOT EXISTS staff_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES stores(id) ON DELETE CASCADE,
  user_id uuid REFERENCES app_users(id) ON DELETE CASCADE,
  -- Current position in map coordinates
  position vector3 NOT NULL,
  -- Current rotation
  rotation quaternion NOT NULL DEFAULT (0, 0, 0, 1),
  -- Nearest marker for context
  nearest_marker_id uuid REFERENCES spatial_markers(id) ON DELETE SET NULL,
  -- Position confidence
  confidence double precision DEFAULT 1.0,
  -- Tracking method
  tracking_method text CHECK (tracking_method IN ('camera', 'marker', 'manual', 'fused')) DEFAULT 'marker',
  recorded_at timestamptz DEFAULT now()
);

ALTER TABLE staff_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_positions_select" ON staff_positions
  FOR SELECT USING (
    store_id = (SELECT store_id FROM app_users WHERE id = auth.uid())
    OR store_id = (SELECT active_store_id FROM app_users WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin')
    OR user_id = auth.uid()
  );

CREATE POLICY "staff_positions_insert" ON staff_positions
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin')
  );

-- Only keep recent positions (last 24h) - use pg_cron or scheduled job to clean
CREATE INDEX IF NOT EXISTS idx_staff_positions_store_time ON staff_positions(store_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_positions_user_time ON staff_positions(user_id, recorded_at DESC);

/*
  # Product Locations
  Maps products to shelf markers for navigation
*/
CREATE TABLE IF NOT EXISTS product_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES stores(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  marker_id uuid REFERENCES spatial_markers(id) ON DELETE CASCADE,
  -- Position on shelf relative to marker
  shelf_position jsonb, -- { shelf_number, position_index, x_offset, y_offset }
  facings int DEFAULT 1,
  is_primary boolean DEFAULT false, -- Primary location if product in multiple places
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (store_id, product_id, marker_id)
);

ALTER TABLE product_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_locations_select" ON product_locations
  FOR SELECT USING (
    store_id = (SELECT store_id FROM app_users WHERE id = auth.uid())
    OR store_id = (SELECT active_store_id FROM app_users WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "product_locations_manage" ON product_locations
  FOR ALL USING (
    store_id = (SELECT store_id FROM app_users WHERE id = auth.uid())
    OR store_id = (SELECT active_store_id FROM app_users WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE INDEX IF NOT EXISTS idx_product_locations_store ON product_locations(store_id);
CREATE INDEX IF NOT EXISTS idx_product_locations_product ON product_locations(product_id);
CREATE INDEX IF NOT EXISTS idx_product_locations_marker ON product_locations(marker_id);

/*
  # Updated_at triggers
*/
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_spatial_maps_updated_at BEFORE UPDATE ON spatial_maps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_spatial_markers_updated_at BEFORE UPDATE ON spatial_markers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shelf_planograms_updated_at BEFORE UPDATE ON shelf_planograms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_spatial_tasks_updated_at BEFORE UPDATE ON spatial_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_product_locations_updated_at BEFORE UPDATE ON product_locations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

/*
  # Helper function: Calculate 3D distance between two vector3
*/
CREATE OR REPLACE FUNCTION vector3_distance(a vector3, b vector3)
RETURNS double precision LANGUAGE sql IMMUTABLE AS $$
  SELECT sqrt(
    (a.x - b.x)^2 + (a.y - b.y)^2 + (a.z - b.z)^2
  );
$$;

/*
  # Helper function: Find nearest markers within distance
*/
CREATE OR REPLACE FUNCTION find_nearest_markers(
  p_map_id uuid,
  p_position vector3,
  p_max_distance double precision DEFAULT 10.0,
  p_limit int DEFAULT 10
)
RETURNS TABLE (
  marker_id uuid,
  marker_type text,
  marker_id_str text,
  position vector3,
  distance double precision
) LANGUAGE sql STABLE AS $$
  SELECT
    sm.id,
    sm.marker_type,
    sm.marker_id,
    sm.position,
    vector3_distance(sm.position, p_position) as distance
  FROM spatial_markers sm
  WHERE sm.map_id = p_map_id
    AND sm.is_active = true
    AND vector3_distance(sm.position, p_position) <= p_max_distance
  ORDER BY distance
  LIMIT p_limit;
$$;