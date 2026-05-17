/*
  # Fix publish central kundrunda version to all stores

  ## Problem
  - `kundrunda_local_versions` is empty (no store has initialized a local version)
  - `publishCentralVersion` only UPDATEs existing local version rows — so when the table
    is empty, the publish does nothing visible
  - There is no mechanism to auto-initialize a store's local version

  ## Solution
  Create a SECURITY DEFINER function `publish_central_kundrunda` that:
  1. Creates a central version snapshot
  2. For each active store:
     a. If no local_version record exists → create one (version_type='local') AND
        copy all HK zones+checkpoints as store-local zones
     b. If a local_version record exists → mark central_version_pending=true

  This function runs as the DB owner and bypasses per-row RLS, which is needed
  because admin's `app_current_store_id()` only returns one store but we need
  to insert data for ALL stores.

  ## New function
  - `publish_central_kundrunda(publisher_id uuid)` — SECURITY DEFINER, callable by anon
*/

CREATE OR REPLACE FUNCTION publish_central_kundrunda(publisher_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snapshot jsonb;
  v_defects_snapshot jsonb;
  v_version_id bigint;
  v_store record;
  v_local_ver record;
  v_hk_zone record;
  v_new_zone_id uuid;
  v_cp record;
  v_hk_defect record;
  v_label text;
BEGIN
  -- Build zone+checkpoint snapshot from HK (global) zones
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', z.id,
      'name', z.name,
      'sort_order', z.sort_order,
      'checkpoints', (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', c.id,
            'label', c.label,
            'description', c.description,
            'sort_order', c.sort_order
          ) ORDER BY c.sort_order
        )
        FROM kundrunda_checkpoints c
        WHERE c.zone_id = z.id
      )
    ) ORDER BY z.sort_order
  )
  INTO v_snapshot
  FROM kundrunda_zones z
  WHERE z.store_id IS NULL;

  -- Build defects snapshot from HK (global) defects
  SELECT jsonb_agg(
    jsonb_build_object('id', d.id, 'label', d.label, 'sort_order', d.sort_order)
    ORDER BY d.sort_order
  )
  INTO v_defects_snapshot
  FROM kundrunda_common_defects d
  WHERE d.store_id IS NULL;

  -- Create the central version record
  v_label := to_char(now() AT TIME ZONE 'Europe/Stockholm', 'YYYY-MM-DD');

  INSERT INTO kundrunda_central_versions (published_by, label, snapshot)
  VALUES (publisher_id, v_label, v_snapshot)
  RETURNING id INTO v_version_id;

  -- Process each active store
  FOR v_store IN
    SELECT id FROM stores WHERE is_active = true
  LOOP
    -- Check if store already has a local version
    SELECT * INTO v_local_ver
    FROM kundrunda_local_versions
    WHERE store_id = v_store.id;

    IF NOT FOUND THEN
      -- Create local version record for this store
      INSERT INTO kundrunda_local_versions (
        store_id, version_type, central_version_pending,
        pending_central_version_id,
        defects_pending_hk_update, pending_defects_snapshot
      )
      VALUES (
        v_store.id, 'local', false,
        v_version_id,
        false, null
      );

      -- Copy HK zones and checkpoints as store-local starting point
      FOR v_hk_zone IN
        SELECT * FROM kundrunda_zones WHERE store_id IS NULL ORDER BY sort_order
      LOOP
        -- Skip if store already has a zone with same name (shouldn't happen for new stores, but be safe)
        IF NOT EXISTS (
          SELECT 1 FROM kundrunda_zones
          WHERE store_id = v_store.id AND lower(trim(name)) = lower(trim(v_hk_zone.name))
        ) THEN
          INSERT INTO kundrunda_zones (name, sort_order, store_id, is_local_override)
          VALUES (v_hk_zone.name, v_hk_zone.sort_order, v_store.id, true)
          RETURNING id INTO v_new_zone_id;

          -- Copy checkpoints for this zone
          FOR v_cp IN
            SELECT * FROM kundrunda_checkpoints
            WHERE zone_id = v_hk_zone.id ORDER BY sort_order
          LOOP
            INSERT INTO kundrunda_checkpoints (
              zone_id, label, description, sort_order, store_id, is_local_override
            )
            VALUES (
              v_new_zone_id, v_cp.label, v_cp.description,
              v_cp.sort_order, v_store.id, true
            );
          END LOOP;
        END IF;
      END LOOP;

      -- Copy HK defects as store-local starting defects
      FOR v_hk_defect IN
        SELECT * FROM kundrunda_common_defects WHERE store_id IS NULL ORDER BY sort_order
      LOOP
        IF NOT EXISTS (
          SELECT 1 FROM kundrunda_common_defects
          WHERE store_id = v_store.id AND hk_defect_id = v_hk_defect.id
        ) THEN
          INSERT INTO kundrunda_common_defects (
            store_id, label, sort_order, hk_defect_id, is_local_override
          )
          VALUES (
            v_store.id, v_hk_defect.label, v_hk_defect.sort_order,
            v_hk_defect.id, true
          );
        END IF;
      END LOOP;

    ELSE
      -- Store already has a local version: mark pending update
      UPDATE kundrunda_local_versions
      SET
        central_version_pending = true,
        pending_central_version_id = v_version_id,
        defects_pending_hk_update = true,
        pending_defects_snapshot = v_defects_snapshot
      WHERE store_id = v_store.id;
    END IF;

  END LOOP;

  RETURN jsonb_build_object('version_id', v_version_id, 'ok', true);
END;
$$;

-- Grant execute to anon so the Supabase client (which uses anon key) can call it
GRANT EXECUTE ON FUNCTION publish_central_kundrunda(uuid) TO anon;
