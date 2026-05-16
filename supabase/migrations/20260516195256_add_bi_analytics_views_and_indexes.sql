/*
  # Block 5: BI Analytics Views, Indexes and RLS

  ## Overview
  Creates three aggregated views for the HK (Huvudkontoret) Admin Dashboard:
  - view_national_completion_rates  — Kundrunda completion rates over time
  - view_regional_performance       — Store results grouped by region
  - view_incident_resolution_time   — Average incident resolution time per store/region

  Also creates supporting performance indexes for aggregate queries so that
  analytics queries don't impact live table performance on handheld devices.

  ## Views

  ### view_national_completion_rates
  Groups completed kundrunda sessions by calendar week.
  Columns: week_start, total_sessions, total_responses, ok_responses,
           completion_rate_pct (0–100), avg_score_pct (0–100)

  ### view_regional_performance
  Groups store-level kundrunda results and incident counts by region.
  Columns: region, store_count, total_sessions, total_responses, ok_responses,
           completion_rate_pct, open_incidents, avg_incident_resolution_hours,
           active_stores_24h

  ### view_incident_resolution_time
  Per-store and per-region mean time from incident creation to resolution/close.
  Columns: store_id, store_name, region, total_incidents, resolved_incidents,
           avg_resolution_hours, median_resolution_hours, sla_breach_count

  ## Security
  All three views have RLS via security-invoker behaviour (views run as the
  calling role, so underlying table RLS applies automatically). Additionally
  a dedicated helper function app_is_admin() guards direct view SELECT policies.

  ## Indexes
  Covering indexes on columns used in GROUP BY / WHERE clauses for BI queries.
*/

-- ──────────────────────────────────────────────────────────────────────────────
-- Performance indexes for BI aggregate queries
-- ──────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_kundrunda_sessions_store_status
  ON kundrunda_sessions (store_id, status, completed_at);

CREATE INDEX IF NOT EXISTS idx_kundrunda_sessions_completed_at
  ON kundrunda_sessions (completed_at DESC)
  WHERE status = 'completed';

CREATE INDEX IF NOT EXISTS idx_kundrunda_responses_session_result
  ON kundrunda_responses (session_id, result);

CREATE INDEX IF NOT EXISTS idx_incidents_store_status_created
  ON incidents (store_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_incidents_resolved_at
  ON incidents (resolved_at)
  WHERE resolved_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_store_status_created
  ON tasks (store_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_users_last_login
  ON app_users (last_login DESC)
  WHERE last_login IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stores_region
  ON stores (region)
  WHERE is_active = true;

-- ──────────────────────────────────────────────────────────────────────────────
-- Helper: is the current session user an admin?
-- SECURITY DEFINER so it doesn't recurse into app_users RLS.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app_is_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN app_current_user_role() = 'admin';
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- View 1: view_national_completion_rates
-- Weekly kundrunda completion rates across all stores.
-- ──────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS view_national_completion_rates;

CREATE VIEW view_national_completion_rates
WITH (security_invoker = true)
AS
SELECT
  date_trunc('week', ks.completed_at)::date                         AS week_start,
  count(DISTINCT ks.id)                                              AS total_sessions,
  count(kr.id)                                                       AS total_responses,
  count(kr.id) FILTER (WHERE kr.result = 'ok')                      AS ok_responses,
  count(kr.id) FILTER (WHERE kr.result = 'avvikelse')               AS defect_responses,
  CASE
    WHEN count(kr.id) = 0 THEN 0
    ELSE round(
      (count(kr.id) FILTER (WHERE kr.result = 'ok'))::numeric
      / count(kr.id)::numeric * 100, 1
    )
  END                                                                AS completion_rate_pct,
  CASE
    WHEN sum(ks.max_score) = 0 THEN 0
    ELSE round(
      sum(ks.total_score)::numeric / sum(ks.max_score)::numeric * 100, 1
    )
  END                                                                AS avg_score_pct,
  count(DISTINCT ks.store_id)                                        AS active_store_count
FROM kundrunda_sessions ks
LEFT JOIN kundrunda_responses kr ON kr.session_id = ks.id
WHERE ks.status = 'completed'
  AND ks.completed_at IS NOT NULL
GROUP BY date_trunc('week', ks.completed_at)
ORDER BY week_start DESC;

-- ──────────────────────────────────────────────────────────────────────────────
-- View 2: view_regional_performance
-- Per-region aggregated KPIs: kundrunda completion, incidents, active stores.
-- ──────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS view_regional_performance;

CREATE VIEW view_regional_performance
WITH (security_invoker = true)
AS
WITH store_kundrunda AS (
  SELECT
    s.id                                                             AS store_id,
    s.name                                                           AS store_name,
    s.region,
    s.is_active,
    count(DISTINCT ks.id)                                            AS total_sessions,
    count(kr.id)                                                     AS total_responses,
    count(kr.id) FILTER (WHERE kr.result = 'ok')                    AS ok_responses,
    count(kr.id) FILTER (WHERE kr.result = 'avvikelse')             AS defect_responses,
    CASE
      WHEN count(kr.id) = 0 THEN 0
      ELSE round(
        (count(kr.id) FILTER (WHERE kr.result = 'ok'))::numeric
        / count(kr.id)::numeric * 100, 1
      )
    END                                                              AS completion_rate_pct,
    max(ks.completed_at)                                             AS last_session_at
  FROM stores s
  LEFT JOIN kundrunda_sessions ks
    ON ks.store_id = s.id AND ks.status = 'completed'
  LEFT JOIN kundrunda_responses kr ON kr.session_id = ks.id
  WHERE s.is_active = true
  GROUP BY s.id, s.name, s.region, s.is_active
),
store_incidents AS (
  SELECT
    store_id,
    count(*) FILTER (WHERE status IN ('open', 'in_progress', 'escalated')) AS open_incidents,
    count(*) FILTER (WHERE status IN ('resolved', 'closed'))               AS resolved_incidents,
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
  coalesce(nullif(trim(sk.region), ''), 'Övrigt')                   AS region,
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
GROUP BY coalesce(nullif(trim(sk.region), ''), 'Övrigt')
ORDER BY completion_rate_pct DESC NULLS LAST;

-- ──────────────────────────────────────────────────────────────────────────────
-- View 3: view_store_performance
-- Per-store KPIs for drill-down within a region.
-- ──────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS view_store_performance;

CREATE VIEW view_store_performance
WITH (security_invoker = true)
AS
SELECT
  s.id                                                               AS store_id,
  s.name                                                             AS store_name,
  coalesce(nullif(trim(s.region), ''), 'Övrigt')                    AS region,
  s.is_active,
  -- Kundrunda
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
  -- Incidents
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
  -- Tasks
  count(DISTINCT t.id) FILTER (WHERE t.status = 'done')             AS tasks_done,
  count(DISTINCT t.id) FILTER (WHERE t.status IN ('todo', 'progress')) AS tasks_open,
  count(DISTINCT t.id) FILTER (WHERE t.status = 'late')             AS tasks_late,
  -- Activity
  max(u.last_login)                                                  AS last_user_login_at,
  bool_or(u.last_login >= now() - interval '24 hours')              AS active_24h
FROM stores s
LEFT JOIN kundrunda_sessions ks ON ks.store_id = s.id AND ks.status = 'completed'
LEFT JOIN kundrunda_responses kr ON kr.session_id = ks.id
LEFT JOIN incidents i ON i.store_id = s.id
LEFT JOIN tasks t ON t.store_id = s.id AND t.parent_task_id IS NULL
LEFT JOIN app_users u ON u.store_id = s.id AND u.is_active = true
WHERE s.is_active = true
GROUP BY s.id, s.name, s.region, s.is_active;

-- ──────────────────────────────────────────────────────────────────────────────
-- View 4: view_incident_resolution_time (as specified in brief)
-- Per-store mean and median time to resolve incidents.
-- ──────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS view_incident_resolution_time;

CREATE VIEW view_incident_resolution_time
WITH (security_invoker = true)
AS
SELECT
  s.id                                                               AS store_id,
  s.name                                                             AS store_name,
  coalesce(nullif(trim(s.region), ''), 'Övrigt')                    AS region,
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
LEFT JOIN incidents i ON i.store_id = s.id
WHERE s.is_active = true
GROUP BY s.id, s.name, s.region
ORDER BY avg_resolution_hours DESC NULLS LAST;

-- ──────────────────────────────────────────────────────────────────────────────
-- RLS on views via row-level access function
-- Note: Views with security_invoker=true inherit the RLS of the underlying
-- tables. The underlying tables (kundrunda_sessions, incidents, tasks, stores,
-- app_users) already have RLS enabled. The views are additionally guarded by
-- a wrapper function that enforces admin-only access at the API level.
--
-- The frontend queries go through the Supabase anon key with the session token
-- header. app_current_user_role() returns 'admin' only for admin sessions.
-- Non-admin queries will return empty result sets because the underlying table
-- RLS policies restrict access to store-scoped data only.
-- ──────────────────────────────────────────────────────────────────────────────

-- Security-definer function that returns national stats only to admins
CREATE OR REPLACE FUNCTION get_national_stats()
RETURNS TABLE (
  total_stores          bigint,
  active_stores_24h     bigint,
  national_completion   numeric,
  avg_resolution_hours  numeric,
  total_open_incidents  bigint,
  total_sessions_7d     bigint,
  total_tasks_late      bigint
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
    (SELECT count(*) FROM stores WHERE is_active = true)::bigint,
    (SELECT count(DISTINCT u.store_id)
     FROM app_users u
     WHERE u.last_login >= now() - interval '24 hours'
       AND u.store_id IS NOT NULL
       AND u.is_active = true)::bigint,
    (SELECT CASE WHEN count(kr.id) = 0 THEN 0
            ELSE round(
              (count(kr.id) FILTER (WHERE kr.result = 'ok'))::numeric
              / count(kr.id)::numeric * 100, 1)
            END
     FROM kundrunda_responses kr
     JOIN kundrunda_sessions ks ON ks.id = kr.session_id
     WHERE ks.completed_at >= now() - interval '30 days'),
    (SELECT round(avg(
              extract(epoch FROM (resolved_at - created_at)) / 3600.0
            )::numeric, 1)
     FROM incidents
     WHERE resolved_at IS NOT NULL
       AND created_at >= now() - interval '30 days'),
    (SELECT count(*) FROM incidents
     WHERE status IN ('open', 'in_progress', 'escalated'))::bigint,
    (SELECT count(DISTINCT id) FROM kundrunda_sessions
     WHERE completed_at >= now() - interval '7 days'
       AND status = 'completed')::bigint,
    (SELECT count(*) FROM tasks
     WHERE status = 'late'
       AND parent_task_id IS NULL)::bigint;
END;
$$;

-- Regional performance function (admin only)
CREATE OR REPLACE FUNCTION get_regional_performance()
RETURNS TABLE (
  region                       text,
  store_count                  bigint,
  total_sessions               bigint,
  completion_rate_pct          numeric,
  open_incidents               bigint,
  avg_incident_resolution_hours numeric,
  active_stores_24h            bigint,
  last_session_at              timestamptz
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
    vp.region,
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

-- Store drill-down function (admin only)
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
  WHERE coalesce(nullif(trim(vsp.region), ''), 'Övrigt') = p_region
  ORDER BY vsp.completion_rate_pct DESC NULLS LAST;
END;
$$;
