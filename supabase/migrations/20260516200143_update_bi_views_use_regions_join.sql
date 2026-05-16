/*
  # Update BI views to use regions table join

  Now that stores have a region_id FK to the regions table, the analytics
  views should derive the region name from the join rather than the free-text
  stores.region column. The trigger keeps stores.region in sync, so both
  approaches work, but joining on regions gives cleaner grouping.

  This migration replaces view_regional_performance, view_store_performance,
  and view_incident_resolution_time with updated versions that join regions.
*/

-- ──────────────────────────────────────────────────────────────────────────────
-- view_regional_performance (updated)
-- ──────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS view_regional_performance;

CREATE VIEW view_regional_performance
WITH (security_invoker = true)
AS
WITH store_kundrunda AS (
  SELECT
    s.id                                                             AS store_id,
    s.name                                                           AS store_name,
    coalesce(r.name, nullif(trim(s.region), ''), 'Övrigt')          AS region,
    s.is_active,
    count(DISTINCT ks.id)                                            AS total_sessions,
    count(kr.id)                                                     AS total_responses,
    count(kr.id) FILTER (WHERE kr.result = 'ok')                    AS ok_responses,
    CASE
      WHEN count(kr.id) = 0 THEN 0
      ELSE round(
        (count(kr.id) FILTER (WHERE kr.result = 'ok'))::numeric
        / count(kr.id)::numeric * 100, 1
      )
    END                                                              AS completion_rate_pct,
    max(ks.completed_at)                                             AS last_session_at
  FROM stores s
  LEFT JOIN regions r ON r.id = s.region_id
  LEFT JOIN kundrunda_sessions ks
    ON ks.store_id = s.id AND ks.status = 'completed'
  LEFT JOIN kundrunda_responses kr ON kr.session_id = ks.id
  WHERE s.is_active = true
  GROUP BY s.id, s.name, r.name, s.region, s.is_active
),
store_incidents AS (
  SELECT
    store_id,
    count(*) FILTER (WHERE status IN ('open', 'in_progress', 'escalated')) AS open_incidents,
    round(
      avg(
        extract(epoch FROM (resolved_at - created_at)) / 3600.0
      ) FILTER (WHERE resolved_at IS NOT NULL), 1
    )                                                                        AS avg_resolution_hours
  FROM incidents
  GROUP BY store_id
),
store_activity AS (
  SELECT
    s.id AS store_id,
    bool_or(u.last_login >= now() - interval '24 hours') AS active_24h
  FROM stores s
  LEFT JOIN app_users u ON u.store_id = s.id AND u.is_active = true
  WHERE s.is_active = true
  GROUP BY s.id
)
SELECT
  sk.region,
  count(DISTINCT sk.store_id)                                        AS store_count,
  sum(sk.total_sessions)                                             AS total_sessions,
  sum(sk.total_responses)                                            AS total_responses,
  sum(sk.ok_responses)                                               AS ok_responses,
  CASE
    WHEN sum(sk.total_responses) = 0 THEN 0
    ELSE round(
      sum(sk.ok_responses)::numeric / sum(sk.total_responses)::numeric * 100, 1
    )
  END                                                                AS completion_rate_pct,
  coalesce(sum(si.open_incidents), 0)                               AS open_incidents,
  round(avg(si.avg_resolution_hours) FILTER (WHERE si.avg_resolution_hours IS NOT NULL), 1)
                                                                     AS avg_incident_resolution_hours,
  count(DISTINCT sk.store_id) FILTER (WHERE sa.active_24h = true)   AS active_stores_24h,
  max(sk.last_session_at)                                            AS last_session_at
FROM store_kundrunda sk
LEFT JOIN store_incidents si ON si.store_id = sk.store_id
LEFT JOIN store_activity sa ON sa.store_id = sk.store_id
GROUP BY sk.region
ORDER BY completion_rate_pct DESC NULLS LAST;

-- ──────────────────────────────────────────────────────────────────────────────
-- view_store_performance (updated)
-- ──────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS view_store_performance;

CREATE VIEW view_store_performance
WITH (security_invoker = true)
AS
SELECT
  s.id                                                               AS store_id,
  s.name                                                             AS store_name,
  coalesce(r.name, nullif(trim(s.region), ''), 'Övrigt')            AS region,
  s.is_active,
  count(DISTINCT ks.id)                                              AS total_sessions,
  count(DISTINCT ks.id) FILTER (
    WHERE ks.completed_at >= now() - interval '7 days'
  )                                                                  AS sessions_last_7d,
  count(kr.id)                                                       AS total_responses,
  count(kr.id) FILTER (WHERE kr.result = 'ok')                      AS ok_responses,
  CASE
    WHEN count(kr.id) = 0 THEN NULL
    ELSE round(
      (count(kr.id) FILTER (WHERE kr.result = 'ok'))::numeric
      / count(kr.id)::numeric * 100, 1
    )
  END                                                                AS completion_rate_pct,
  max(ks.completed_at)                                               AS last_session_at,
  count(DISTINCT i.id) FILTER (
    WHERE i.status IN ('open', 'in_progress', 'escalated')
  )                                                                  AS open_incidents,
  count(DISTINCT i.id) FILTER (
    WHERE i.status IN ('resolved', 'closed')
  )                                                                  AS resolved_incidents,
  round(
    avg(
      extract(epoch FROM (i.resolved_at - i.created_at)) / 3600.0
    ) FILTER (WHERE i.resolved_at IS NOT NULL), 1
  )                                                                  AS avg_resolution_hours,
  count(DISTINCT i.id) FILTER (
    WHERE i.sla_deadline IS NOT NULL
      AND i.resolved_at IS NULL
      AND i.sla_deadline < now()
  )                                                                  AS sla_breaches,
  count(DISTINCT t.id) FILTER (WHERE t.status = 'done')             AS tasks_done,
  count(DISTINCT t.id) FILTER (WHERE t.status IN ('todo', 'progress')) AS tasks_open,
  count(DISTINCT t.id) FILTER (WHERE t.status = 'late')             AS tasks_late,
  max(u.last_login)                                                  AS last_user_login_at,
  bool_or(u.last_login >= now() - interval '24 hours')              AS active_24h
FROM stores s
LEFT JOIN regions r ON r.id = s.region_id
LEFT JOIN kundrunda_sessions ks ON ks.store_id = s.id AND ks.status = 'completed'
LEFT JOIN kundrunda_responses kr ON kr.session_id = ks.id
LEFT JOIN incidents i ON i.store_id = s.id
LEFT JOIN tasks t ON t.store_id = s.id AND t.parent_task_id IS NULL
LEFT JOIN app_users u ON u.store_id = s.id AND u.is_active = true
WHERE s.is_active = true
GROUP BY s.id, s.name, r.name, s.region, s.is_active;

-- ──────────────────────────────────────────────────────────────────────────────
-- view_incident_resolution_time (updated)
-- ──────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS view_incident_resolution_time;

CREATE VIEW view_incident_resolution_time
WITH (security_invoker = true)
AS
SELECT
  s.id                                                               AS store_id,
  s.name                                                             AS store_name,
  coalesce(r.name, nullif(trim(s.region), ''), 'Övrigt')            AS region,
  count(i.id)                                                        AS total_incidents,
  count(i.id) FILTER (WHERE i.resolved_at IS NOT NULL)              AS resolved_incidents,
  round(
    avg(
      extract(epoch FROM (i.resolved_at - i.created_at)) / 3600.0
    ) FILTER (WHERE i.resolved_at IS NOT NULL), 1
  )                                                                  AS avg_resolution_hours,
  round(
    percentile_cont(0.5) WITHIN GROUP (
      ORDER BY extract(epoch FROM (i.resolved_at - i.created_at)) / 3600.0
    ) FILTER (WHERE i.resolved_at IS NOT NULL)::numeric, 1
  )                                                                  AS median_resolution_hours,
  count(i.id) FILTER (
    WHERE i.sla_deadline IS NOT NULL
      AND (
        (i.resolved_at IS NOT NULL AND i.resolved_at > i.sla_deadline)
        OR (i.resolved_at IS NULL AND i.sla_deadline < now())
      )
  )                                                                  AS sla_breach_count
FROM stores s
LEFT JOIN regions r ON r.id = s.region_id
LEFT JOIN incidents i ON i.store_id = s.id
WHERE s.is_active = true
GROUP BY s.id, s.name, r.name, s.region
ORDER BY avg_resolution_hours DESC NULLS LAST;

-- ──────────────────────────────────────────────────────────────────────────────
-- Update get_store_performance_by_region to match on the joined region name
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_store_performance_by_region(p_region text)
RETURNS TABLE (
  store_id             uuid,
  store_name           text,
  region               text,
  completion_rate_pct  numeric,
  sessions_last_7d     bigint,
  open_incidents       bigint,
  avg_resolution_hours numeric,
  sla_breaches         bigint,
  tasks_late           bigint,
  last_session_at      timestamptz,
  active_24h           boolean
)
LANGUAGE plpgsql
STABLE
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
    vsp.region,
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
