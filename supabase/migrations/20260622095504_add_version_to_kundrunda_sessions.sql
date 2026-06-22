-- Add optimistic locking version counter to kundrunda_sessions.
-- Each response save increments this. Clients check the version before writing.
ALTER TABLE kundrunda_sessions
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
