/*
  # Add default for ref_number on incidents

  ref_number was NOT NULL with no default, causing all client-side inserts
  that omit it to fail with a not-null constraint violation.
  Generate a short unique reference automatically.
*/

ALTER TABLE incidents
  ALTER COLUMN ref_number SET DEFAULT 'INC-' || to_char(now(), 'YYYYMMDD') || '-' || substring(gen_random_uuid()::text, 1, 6);
