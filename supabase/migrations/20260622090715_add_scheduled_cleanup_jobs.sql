-- ─── Scheduled maintenance jobs ──────────────────────────────────────────────
-- Runs via pg_cron (already installed in this project).
-- Jobs are idempotent: unschedule any existing copy before scheduling.

-- 1. Delete expired app_sessions — runs every Sunday at 03:00 UTC
SELECT cron.unschedule('purge-expired-sessions')
FROM cron.job WHERE jobname = 'purge-expired-sessions';

SELECT cron.schedule(
  'purge-expired-sessions',
  '0 3 * * 0',  -- every Sunday at 03:00 UTC
  $$
    DELETE FROM app_sessions
    WHERE expires_at < now();
  $$
);

-- 2. Delete notifications older than 30 days — runs every day at 02:00 UTC
SELECT cron.unschedule('purge-old-notifications')
FROM cron.job WHERE jobname = 'purge-old-notifications';

SELECT cron.schedule(
  'purge-old-notifications',
  '0 2 * * *',  -- every day at 02:00 UTC
  $$
    DELETE FROM notifications
    WHERE created_at < now() - INTERVAL '30 days';
  $$
);
