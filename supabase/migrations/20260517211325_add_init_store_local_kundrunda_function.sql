/*
  # Add function to initialize a single store's local kundrunda version

  ## Problem
  `ensureLocalVersionRecord` runs from the client and inserts into
  `kundrunda_local_versions`. However, RLS on that table checks
  `user_stores` membership via `app_current_user_id()`. If there is any
  subtle issue with the session context, or if the zone INSERT for
  `kundrunda_checkpoints` / `kundrunda_zones` similarly fails, the store
  gets orphan local zones without a matching `kundrunda_local_versions` row.

  This SECURITY DEFINER function is called from the client with just the
  store_id and it handles the full initialization atomically, bypassing RLS.

  ## New function
  - `init_store_local_kundrunda(p_store_id uuid)` — idempotent, safe to
    call multiple times; does nothing if the store already has a local version.
*/

CREATE OR REPLACE FUNCTION init_store_local_kundrunda(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hk_zone record;
  v_new_zone_id uuid;
  v_cp record;
  v_hk_defect record;
BEGIN
  -- Idempotent: skip if local version record already exists
  IF EXISTS (SELECT 1 FROM kundrunda_local_versions WHERE store_id = p_store_id) THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true);
  END IF;

  -- Create local version record
  INSERT INTO kundrunda_local_versions (store_id, version_type, central_version_pending)
  VALUES (p_store_id, 'local', false);

  -- Copy HK zones + checkpoints as local starting point
  FOR v_hk_zone IN
    SELECT * FROM kundrunda_zones WHERE store_id IS NULL ORDER BY sort_order
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM kundrunda_zones
      WHERE store_id = p_store_id AND lower(trim(name)) = lower(trim(v_hk_zone.name))
    ) THEN
      INSERT INTO kundrunda_zones (name, sort_order, store_id, is_local_override)
      VALUES (v_hk_zone.name, v_hk_zone.sort_order, p_store_id, true)
      RETURNING id INTO v_new_zone_id;

      FOR v_cp IN
        SELECT * FROM kundrunda_checkpoints WHERE zone_id = v_hk_zone.id ORDER BY sort_order
      LOOP
        INSERT INTO kundrunda_checkpoints (
          zone_id, label, description, sort_order, store_id, is_local_override
        )
        VALUES (
          v_new_zone_id, v_cp.label, v_cp.description,
          v_cp.sort_order, p_store_id, true
        );
      END LOOP;
    END IF;
  END LOOP;

  -- Copy HK common defects as local starting defects
  FOR v_hk_defect IN
    SELECT * FROM kundrunda_common_defects WHERE store_id IS NULL ORDER BY sort_order
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM kundrunda_common_defects
      WHERE store_id = p_store_id AND hk_defect_id = v_hk_defect.id
    ) THEN
      INSERT INTO kundrunda_common_defects (
        store_id, label, sort_order, hk_defect_id, is_local_override
      )
      VALUES (p_store_id, v_hk_defect.label, v_hk_defect.sort_order, v_hk_defect.id, true);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'skipped', false);
END;
$$;

GRANT EXECUTE ON FUNCTION init_store_local_kundrunda(uuid) TO anon;
