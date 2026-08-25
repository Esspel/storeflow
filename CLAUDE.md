# StoreFlow

Retail store management application built with TanStack Start, React, and Supabase. Netlify auto builds and Supabase autoruns new files when pushing to GitHub.

## Agent skills

### Issue tracker
GitHub Issues at https://github.com/Esspel/storeflow. See `docs/agents/issue-tracker.md`.

### Domain docs
Single-context layout with `CONTEXT.md` at repo root and ADRs in `docs/adr/`. See `docs/agents/domain.md`.

# Project Guidelines & Claude Configuration

## Language & Communication
- **Primary Language:** Swedish (Svenska).
- Responses, explanations, and commit messages should be in Swedish unless specified otherwise.
- Code comments, SQL scripts, variable names, and technical terms should remain in English.

## Database & Supabase Migration Rules (Idempotency)
- **Always Idempotent:** All SQL migrations in `supabase/migrations/` MUST be completely idempotent.
- **Policies:** Always prepend `DROP POLICY IF EXISTS "policy_name" ON table_name;` directly before any `CREATE POLICY`.
- **Functions:** Use `CREATE OR REPLACE FUNCTION` and ensure parameter/return types are standard PostgreSQL or valid extensions (e.g., `vector(3)` for pgvector, never invalid types like `vector3`).
- **Tables & Indexes:** Always use `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`.
- **Columns:** Wrap column additions in `DO $$ BEGIN IF NOT EXISTS (...) THEN ALTER TABLE ... ADD COLUMN ...; END IF; END $$;`.
- **Type Generation:** Remind or execute `npx supabase gen types typescript` after database schema updates.

## Skills & Tool Usage
- **CLI Commands:** Translate user intent from Swedish into precise CLI execution (e.g., `supabase db push`, `npm run build`, `git status`).
- **Error Diagnostics:** Diagnose issues in Swedish, but quote raw terminal outputs/SQL errors verbatim.