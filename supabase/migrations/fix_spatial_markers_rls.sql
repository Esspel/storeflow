-- ============================================================
-- Fix RLS policies for spatial_markers table
-- Run this in Supabase SQL Editor
-- ============================================================

-- Enable RLS
ALTER TABLE spatial_markers ENABLE ROW LEVEL SECURITY;

-- Policy: authenticated users can SELECT markers for their store
CREATE OR REPLACE POLICY "auth_select_spatial_markers"
  ON spatial_markers
  FOR SELECT
  TO authenticated
  USING (
    store_id IN (
      SELECT store_id FROM user_stores
      WHERE user_id = auth.uid()
    )
  );

-- Policy: store managers can INSERT markers
CREATE OR REPLACE POLICY "auth_insert_spatial_markers"
  ON spatial_markers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    store_id IN (
      SELECT store_id FROM user_stores
      WHERE user_id = auth.uid()
    )
  );

-- Policy: store managers can UPDATE markers
CREATE OR REPLACE POLICY "auth_update_spatial_markers"
  ON spatial_markers
  FOR UPDATE
  TO authenticated
  USING (
    store_id IN (
      SELECT store_id FROM user_stores
      WHERE user_id = auth.uid()
    )
  );

-- Policy: store managers can DELETE markers
CREATE OR REPLACE POLICY "auth_delete_spatial_markers"
  ON spatial_markers
  FOR DELETE
  TO authenticated
  USING (
    store_id IN (
      SELECT store_id FROM user_stores
      WHERE user_id = auth.uid()
    )
  );
