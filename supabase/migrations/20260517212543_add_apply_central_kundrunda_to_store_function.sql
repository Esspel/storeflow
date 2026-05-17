/*
  # Add function to apply central kundrunda version to a store

  When a store chef chooses "Uppdatera till central version", this function
  replaces the store's local zones and checkpoints with the current HK (global)
  zones and checkpoints, then clears the pending flag.

  It runs SECURITY DEFINER to bypass per-store RLS when deleting/inserting
  zones and checkpoints for a specific store.
*/

CREATE OR REPLACE FUNCTION apply_central_kundrunda_to_store(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hk_zone record;
  v_new_zone_id uuid;
  v_cp record;
BEGIN
  -- Delete all existing store-local checkpoints
  DELETE FROM kundrunda_checkpoints WHERE store_id = p_store_id;

  -- Delete all existing store-local zones
  DELETE FROM kundrunda_zones WHERE store_id = p_store_id;

  -- Copy current HK zones + checkpoints as new local versions
  FOR v_hk_zone IN
    SELECT * FROM kundrunda_zones WHERE store_id IS NULL ORDER BY sort_order
  LOOP
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
  END LOOP;

  -- Update the local version record
  UPDATE kundrunda_local_versions
  SET
    version_type = 'local',
    central_version_pending = false,
    pending_central_version_id = null
  WHERE store_id = p_store_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION apply_central_kundrunda_to_store(uuid) TO anon;
