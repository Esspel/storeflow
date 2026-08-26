/*
  # Spatial Walls / Hindrance Geometry
  Stores wall segments as line segments (vector3 start/end) per map.
  Used by route-optimizer checkLineOfSight for raycasting.
*/
CREATE TABLE IF NOT EXISTS spatial_walls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id uuid REFERENCES spatial_maps(id) ON DELETE CASCADE NOT NULL,
  start_pos vector3 NOT NULL,
  end_pos vector3 NOT NULL,
  type text CHECK (type IN ('wall', 'shelf', 'barrier', 'obstacle')) DEFAULT 'wall',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_spatial_walls_map ON spatial_walls(map_id);

ALTER TABLE spatial_walls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "spatial_walls_select" ON spatial_walls
  FOR SELECT USING (
    map_id IN (
      SELECT id FROM spatial_maps WHERE store_id = (SELECT store_id FROM app_users WHERE id = auth.uid())
    )
    OR EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin')
  );
