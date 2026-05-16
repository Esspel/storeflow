
/*
  # Block 1d: Data Retention — Monthly anonymization via pg_cron

  ## Summary
  Enables pg_cron and creates a monthly job that anonymizes sensitive data older than
  12 months in three tables: incidents, kundrunda_sessions, and tasks.

  Anonymization strategy (not hard DELETE) is used to preserve audit integrity while
  removing personally identifiable information from old records.

  ## Tables Affected
  - **incidents**: created_by set to NULL, description replaced with placeholder
  - **kundrunda_sessions**: conducted_by set to NULL
  - **tasks**: created_by, completed_by set to NULL

  ## Schedule
  - Runs on the 1st of every month at 03:00 UTC
  - Retention window: 12 months (1 year)

  ## Important Notes
  - pg_cron extension is installed in the cron schema (Supabase default)
  - The anonymize function runs as SECURITY DEFINER so it can bypass RLS
  - Foreign key columns for user references use SET NULL rather than CASCADE to preserve
    the anonymized rows; ensure FK constraints are nullable (verified before adding)
*/

-- Enable pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA cron;

GRANT USAGE ON SCHEMA cron TO postgres;

-- ─────────────────────────────────────────────────────────────
-- Retention function — anonymizes rows older than 12 months
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.run_data_retention()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cutoff timestamptz := now() - INTERVAL '12 months';
BEGIN
  -- Anonymize incidents older than 12 months
  UPDATE incidents
  SET
    created_by  = NULL,
    description = '[Anonymiserad efter 12 månader]'
  WHERE created_at < cutoff
    AND description != '[Anonymiserad efter 12 månader]';

  -- Anonymize kundrunda_sessions older than 12 months
  UPDATE kundrunda_sessions
  SET conducted_by = NULL
  WHERE created_at < cutoff
    AND conducted_by IS NOT NULL;

  -- Anonymize tasks older than 12 months
  UPDATE tasks
  SET
    created_by   = NULL,
    completed_by = NULL
  WHERE created_at < cutoff
    AND (created_by IS NOT NULL OR completed_by IS NOT NULL);

  RAISE LOG 'data_retention: anonymized records older than %', cutoff;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- Schedule monthly on 1st at 03:00 UTC
-- ─────────────────────────────────────────────────────────────
SELECT cron.schedule(
  'monthly-data-retention',
  '0 3 1 * *',
  $$SELECT public.run_data_retention()$$
);
