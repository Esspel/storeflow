/*
  # Recreate get_regional_performance and get_store_performance_by_region RPCs

  Drop first, then recreate with updated return column names (distrikt instead of region).
*/

DROP FUNCTION IF EXISTS get_regional_performance();
DROP FUNCTION IF EXISTS get_store_performance_by_region(text);

CREATE FUNCTION get_regional_performance()
RETURNS TABLE (
  distrikt text,
  store_count bigint,
  total_sessions numeric,
  completion_rate_pct numeric,
  open_incidents numeric,
  avg_incident_resolution_hours numeric,
  active_stores_24h bigint,
  last_session_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT app_is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  RETURN QUERY
  SELECT
    vp.region AS distrikt,
    vp.store_count,
    vp.total_sessions,
    vp.completion_rate_pct,
    vp.open_incidents,
    vp.avg_incident_resolution_hours,
    vp.active_stores_24h,
    vp.last_session_at
  FROM view_regional_performance vp;
END;
$$;

CREATE FUNCTION get_store_performance_by_region(p_region text)
RETURNS TABLE (
  store_id uuid,
  store_name text,
  distrikt text,
  completion_rate_pct numeric,
  sessions_last_7d bigint,
  open_incidents bigint,
  avg_resolution_hours numeric,
  sla_breaches bigint,
  tasks_late bigint,
  last_session_at timestamptz,
  active_24h boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT app_is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  RETURN QUERY
  SELECT
    vsp.store_id,
    vsp.store_name,
    vsp.region AS distrikt,
    vsp.completion_rate_pct,
    vsp.sessions_last_7d,
    vsp.open_incidents,
    vsp.avg_resolution_hours,
    vsp.sla_breaches,
    vsp.tasks_late,
    vsp.last_session_at,
    vsp.active_24h
  FROM view_store_performance vsp
  WHERE vsp.region = p_region
  ORDER BY vsp.completion_rate_pct DESC NULLS LAST;
END;
$$;
