/*
  # Fix publish_central_kundrunda function: v_version_id type mismatch

  ## Problem
  The function declared `v_version_id uuid` but `kundrunda_central_versions.id`
  is an integer (serial). The RETURNING clause tried to assign an integer into a
  uuid variable, causing `invalid input syntax for type uuid: "35"` on every call.

  ## Fix
  Recreate the function with `v_version_id integer` so the RETURNING clause and
  all subsequent references to the version id use the correct type.
*/

CREATE OR REPLACE FUNCTION publish_central_kundrunda(publisher_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store record;
  v_local_ver record;
  v_snapshot jsonb;
  v_defects_snapshot jsonb;
  v_version_id integer;
  v_label text;
  v_hk_zone record;
  v_new_zone_id uuid;
  v_cp record;
  v_hk_defect record;
  v_defects_changed boolean;
  v_existing_defects_snapshot jsonb;
BEGIN
  -- Build zones snapshot from HK (global) zones
  SELECT jsonb_agg(
    jsonb_build_object(
      'name', z.name,
      'sort_order', z.sort_order,
      'checkpoints', (
        SELECT jsonb_agg(
          jsonb_build_object('label', c.label, 'description', c.description, 'sort_order', c.sort_order)
          ORDER BY c.sort_order
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
    jsonb_build_object('label', d.label, 'sort_order', d.sort_order)
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
      -- Create local version record for this store (first publish)
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
        IF NOT EXISTS (
          SELECT 1 FROM kundrunda_zones
          WHERE store_id = v_store.id AND lower(trim(name)) = lower(trim(v_hk_zone.name))
        ) THEN
          INSERT INTO kundrunda_zones (name, sort_order, store_id, is_local_override)
          VALUES (v_hk_zone.name, v_hk_zone.sort_order, v_store.id, true)
          RETURNING id INTO v_new_zone_id;

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
          WHERE store_id = v_store.id AND lower(trim(label)) = lower(trim(v_hk_defect.label))
        ) THEN
          INSERT INTO kundrunda_common_defects (label, sort_order, store_id, hk_defect_id, is_hk_synced)
          VALUES (
            v_hk_defect.label, v_hk_defect.sort_order, v_store.id,
            v_hk_defect.id, true
          );
        END IF;
      END LOOP;

    ELSE
      -- Store already has a local version — compare before setting pending flags

      -- Compare defects: use pending snapshot if one exists, otherwise build from HK defects
      IF v_local_ver.pending_defects_snapshot IS NOT NULL THEN
        v_existing_defects_snapshot := v_local_ver.pending_defects_snapshot;
      ELSE
        SELECT jsonb_agg(
          jsonb_build_object('label', d.label, 'sort_order', d.sort_order)
          ORDER BY d.sort_order
        )
        INTO v_existing_defects_snapshot
        FROM kundrunda_common_defects d
        WHERE d.store_id IS NULL;
      END IF;

      -- Defects changed if the new snapshot differs from what the store already has pending
      v_defects_changed := (v_defects_snapshot IS DISTINCT FROM v_existing_defects_snapshot);

      UPDATE kundrunda_local_versions
      SET
        central_version_pending = true,
        pending_central_version_id = v_version_id,
        defects_pending_hk_update = CASE
          WHEN v_defects_changed THEN true
          ELSE defects_pending_hk_update
        END,
        pending_defects_snapshot = CASE
          WHEN v_defects_changed THEN v_defects_snapshot
          ELSE pending_defects_snapshot
        END
      WHERE store_id = v_store.id;
    END IF;

  END LOOP;

  RETURN jsonb_build_object('version_id', v_version_id, 'ok', true);
END;
$$;
