/*
  # Fix publish_central_kundrunda to mark all stores as pending

  Previously, new stores (no local version yet) had their local version
  initialized with central_version_pending = false, meaning they never
  saw the version choice popup.

  Now all stores — new and existing — get central_version_pending = true
  when a central version is published, so all chefs see the popup.

  For new stores: zones are NOT pre-copied. The chef's choice in the popup
  drives whether central zones or a blank local version is used.
  init_store_local_kundrunda still handles the initial setup when a chef
  first opens their kundrunda page WITHOUT a publish event.
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

  v_label := to_char(now() AT TIME ZONE 'Europe/Stockholm', 'YYYY-MM-DD');

  INSERT INTO kundrunda_central_versions (published_by, label, snapshot)
  VALUES (publisher_id, v_label, v_snapshot)
  RETURNING id INTO v_version_id;

  -- For ALL active stores: upsert local_version record with pending=true
  FOR v_store IN
    SELECT id FROM stores WHERE is_active = true
  LOOP
    INSERT INTO kundrunda_local_versions (
      store_id, version_type,
      central_version_pending, pending_central_version_id,
      defects_pending_hk_update, pending_defects_snapshot
    )
    VALUES (
      v_store.id, 'local',
      true, v_version_id,
      true, v_defects_snapshot
    )
    ON CONFLICT (store_id) DO UPDATE SET
      central_version_pending    = true,
      pending_central_version_id = v_version_id,
      defects_pending_hk_update  = true,
      pending_defects_snapshot   = v_defects_snapshot;
  END LOOP;

  RETURN jsonb_build_object('version_id', v_version_id, 'ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION publish_central_kundrunda(uuid) TO anon;
