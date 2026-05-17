/*
  # Update BI views to use distrikt_namn instead of region

  Drop and recreate both views so they group by distrikt_namn
  instead of the legacy `region` column.
*/

DROP VIEW IF EXISTS view_regional_performance CASCADE;
DROP VIEW IF EXISTS view_store_performance CASCADE;

CREATE VIEW view_store_performance AS
SELECT
  s.id AS store_id,
  s.name AS store_name,
  COALESCE(NULLIF(TRIM(s.distrikt_namn), ''), 'Övrigt') AS region,
  s.is_active,
  COUNT(DISTINCT ks.id) AS total_sessions,
  COUNT(DISTINCT ks.id) FILTER (WHERE ks.completed_at >= now() - INTERVAL '7 days') AS sessions_last_7d,
  COUNT(kr.id) AS total_responses,
  COUNT(kr.id) FILTER (WHERE kr.result = 'ok') AS ok_responses,
  CASE
    WHEN COUNT(kr.id) = 0 THEN NULL::numeric
    ELSE ROUND((COUNT(kr.id) FILTER (WHERE kr.result = 'ok')::numeric / COUNT(kr.id)::numeric) * 100, 1)
  END AS completion_rate_pct,
  MAX(ks.completed_at) AS last_session_at,
  COUNT(DISTINCT i.id) FILTER (WHERE i.status IN ('open', 'in_progress', 'escalated')) AS open_incidents,
  COUNT(DISTINCT i.id) FILTER (WHERE i.status IN ('resolved', 'closed')) AS resolved_incidents,
  ROUND(AVG(EXTRACT(epoch FROM (i.resolved_at - i.created_at)) / 3600.0) FILTER (WHERE i.resolved_at IS NOT NULL), 1) AS avg_resolution_hours,
  COUNT(DISTINCT i.id) FILTER (WHERE i.sla_deadline IS NOT NULL AND i.resolved_at IS NULL AND i.sla_deadline < now()) AS sla_breaches,
  COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'done') AS tasks_done,
  COUNT(DISTINCT t.id) FILTER (WHERE t.status IN ('todo', 'progress')) AS tasks_open,
  COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'late') AS tasks_late,
  MAX(u.last_login) AS last_user_login_at,
  BOOL_OR(u.last_login >= now() - INTERVAL '24 hours') AS active_24h
FROM stores s
LEFT JOIN kundrunda_sessions ks ON ks.store_id = s.id AND ks.status = 'completed'
LEFT JOIN kundrunda_responses kr ON kr.session_id = ks.id
LEFT JOIN incidents i ON i.store_id = s.id
LEFT JOIN tasks t ON t.store_id = s.id AND t.parent_task_id IS NULL
LEFT JOIN app_users u ON u.store_id = s.id AND u.is_active = true
WHERE s.is_active = true
GROUP BY s.id, s.name, s.distrikt_namn, s.is_active;

CREATE VIEW view_regional_performance AS
WITH store_data AS (
  SELECT
    COALESCE(NULLIF(TRIM(s.distrikt_namn), ''), 'Övrigt') AS region,
    s.id AS store_id,
    COUNT(DISTINCT ks.id) AS total_sessions,
    COUNT(kr.id) AS total_responses,
    COUNT(kr.id) FILTER (WHERE kr.result = 'ok') AS ok_responses,
    MAX(ks.completed_at) AS last_session_at
  FROM stores s
  LEFT JOIN kundrunda_sessions ks ON ks.store_id = s.id AND ks.status = 'completed'
  LEFT JOIN kundrunda_responses kr ON kr.session_id = ks.id
  WHERE s.is_active = true
  GROUP BY s.id, s.distrikt_namn
),
incident_data AS (
  SELECT
    COALESCE(NULLIF(TRIM(s.distrikt_namn), ''), 'Övrigt') AS region,
    COUNT(*) FILTER (WHERE i.status IN ('open', 'in_progress', 'escalated')) AS open_incidents,
    ROUND(AVG(EXTRACT(epoch FROM (i.resolved_at - i.created_at)) / 3600.0) FILTER (WHERE i.resolved_at IS NOT NULL), 1) AS avg_incident_resolution_hours
  FROM incidents i
  JOIN stores s ON s.id = i.store_id AND s.is_active = true
  GROUP BY s.distrikt_namn
),
activity_data AS (
  SELECT
    COALESCE(NULLIF(TRIM(s.distrikt_namn), ''), 'Övrigt') AS region,
    s.id AS store_id,
    BOOL_OR(u.last_login >= now() - INTERVAL '24 hours') AS any_active
  FROM stores s
  LEFT JOIN app_users u ON u.store_id = s.id AND u.is_active = true
  WHERE s.is_active = true
  GROUP BY s.id, s.distrikt_namn
)
SELECT
  sd.region,
  COUNT(DISTINCT sd.store_id) AS store_count,
  SUM(sd.total_sessions) AS total_sessions,
  CASE
    WHEN SUM(sd.total_responses) = 0 THEN 0::numeric
    ELSE ROUND((SUM(sd.ok_responses)::numeric / SUM(sd.total_responses)::numeric) * 100, 1)
  END AS completion_rate_pct,
  COALESCE(SUM(id_data.open_incidents), 0) AS open_incidents,
  ROUND(AVG(id_data.avg_incident_resolution_hours) FILTER (WHERE id_data.avg_incident_resolution_hours IS NOT NULL), 1) AS avg_incident_resolution_hours,
  COUNT(DISTINCT sd.store_id) FILTER (WHERE act.any_active = true) AS active_stores_24h,
  MAX(sd.last_session_at) AS last_session_at
FROM store_data sd
LEFT JOIN incident_data id_data ON id_data.region = sd.region
LEFT JOIN activity_data act ON act.store_id = sd.store_id
GROUP BY sd.region
ORDER BY completion_rate_pct DESC NULLS LAST;
