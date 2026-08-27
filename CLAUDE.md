# StoreFlow

Retail store management application built with TanStack Start, React, and Supabase.

Deployment:
- Netlify builds and deploys the application from GitHub.
- Supabase database changes are deployed through the project's configured migration/deployment workflow.
- Never assume that a local migration has been applied to production without verifying the database state.

- **Complete Implementation:** Always implement requested features fully. Never leave production functionality as a placeholder, stub, `TODO`, `"coming soon"`, hardcoded mock, fake success state, or non-functional UI control.
- **Accuracy & Quality:** Never knowingly leave errors, broken behavior, type errors, lint errors, or failed tests introduced by the current change. Fix relevant pre-existing errors when they block or directly affect the requested work. Do not expand scope unnecessarily.
- **Defensive Programming:** Prevent null/undefined runtime errors with appropriate guards, optional chaining where semantically appropriate, explicit loading/error states, and safe fallback values. Do not use optional chaining merely to suppress errors.

### Issue Tracker
GitHub Issues at https://github.com/Esspel/storeflow. See `docs/agents/issue-tracker.md`.

### Domain Docs
Single-context layout with `CONTEXT.md` at repo root and ADRs in `docs/adr/`. See `docs/agents/domain.md`.

## Git

- Inspect `git status` before making changes when repository state may affect the task.
- Do not discard, reset, overwrite, or revert user changes.
- Do not modify unrelated files unless required by the requested change.
- Keep commits focused when commits are requested.
- Never amend, rebase, force-push, or rewrite Git history unless explicitly instructed.
- Never commit secrets, credentials, generated secrets, or environment files containing secrets.
- Before modifying files with existing uncommitted changes, inspect those changes and preserve their intent.
- Do not overwrite unrelated uncommitted work even if it conflicts with the preferred implementation pattern.

---

# Project Guidelines & Claude Configuration

## Language & Communication
- **Primary Language:** Swedish (Svenska).
- Responses, explanations, and commit messages should be in Swedish.
- Code comments, SQL scripts, variable names, and technical terms must remain in English.

### CLI & Tooling

- Prefer the project's existing npm scripts and tooling over ad-hoc commands.
- Before running destructive commands, verify their scope.
- Never use `--force`, destructive database commands, or destructive Git commands unless explicitly required and safe for the current task.
- When a command fails, diagnose the actual error before trying unrelated commands.

## Database & Supabase Rules

### Data Access Architecture
- **Direct Supabase SDK Only:** All database operations inside the application MUST use `@supabase/supabase-js`. Never write custom REST `fetch()` calls or express endpoints for internal app features.
- **Strict UUID Types:** UUID values must be validated at application boundaries before being used in queries against UUID columns. Reject invalid UUIDs rather than converting them, inventing them, or passing placeholder values.
- Never use mock identifiers such as `"demo-store-1"` for UUID columns.
- Tests may use generated valid UUIDs or explicitly defined test fixtures.

### Migration Rules (Idempotency & Timestamping)
- **Migration Safety:** Migrations must be safe to apply to the intended schema state and must not fail because objects already exist when the migration explicitly supports existing installations.
- Never modify an already-applied migration to fix a schema problem. Create a new migration instead.
- **Unique Timestamps:** Every new migration file MUST have a unique, incremented timestamp filename to avoid `schema_migrations_pkey` duplicate key errors (e.g., `YYYYMMDDHHMMSS_description.sql`).
- **Policies:** When creating or intentionally replacing a policy, use `DROP POLICY IF EXISTS` immediately before `CREATE POLICY` to make the migration safe against duplicate policy errors. Never drop a policy merely to bypass an error without verifying its intended access semantics.
- **Functions:** Use `CREATE OR REPLACE FUNCTION` and ensure parameter/return types are standard PostgreSQL or valid extensions (e.g., `vector(3)` for pgvector, never invalid types like `vector3`).
- **Tables & Indexes:** Always use `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`.
- **Foreign Keys & Constraints:** Ensure referenced columns have a `UNIQUE` constraint or are `PRIMARY KEY` before creating foreign key constraints.
- **Columns:** Wrap column additions in `DO $$ BEGIN IF NOT EXISTS (...) THEN ALTER TABLE ... ADD COLUMN ...; END IF; END $$;`.
- **Type Generation:** Run `npx supabase gen types typescript` after any schema updates.
- **Never rewrite historical migrations** unless explicitly instructed. Schema corrections must be implemented as new migrations.
- Never use `DROP TABLE`, `DROP COLUMN`, or destructive schema changes without explicitly verifying that existing production data will not be lost.
- Prefer additive migrations when possible.
- When changing existing data or schema semantics, preserve backwards compatibility where the application may temporarily run against both old and new versions.

### Row Level Security

- RLS MUST be enabled on every application table containing store, user, customer, delivery, product, or other business data.
- Never expose application data to `anon` unless public access is explicitly required by the feature.
- Every application table and its policies must explicitly consider `anon` and `authenticated` access. Use only the roles that are intentionally authorized for each operation.
- Never use `USING (true)` or `WITH CHECK (true)` for sensitive application tables unless unrestricted access is explicitly intended.
- Verify INSERT, SELECT, UPDATE, and DELETE policies independently.
- Never assume authentication alone provides authorization. Authorization must be enforced by RLS and/or trusted server-side logic.
- Never expose service-role credentials to browser/client code.

### Security

- Never expose Supabase service-role keys, database credentials, private API keys, or other secrets to client-side code.
- Never commit secrets to Git.
- Use environment variables for secrets.
- Treat all client-provided IDs, roles, store IDs, and permissions as untrusted input.
- Never rely on UI restrictions as authorization.
- Validate authorization server-side and through RLS where applicable.

## Business Domain & Data Mapping Rules
- **Article Matching:**
  - **Delivery Note Import (Ersättningskontroll):** Primary match on `sap_article_id` (Mat-nr). Fallback match on `bnr`. NEVER use SKU for article mapping.
  - **Planogram Import:** Match on `bnr` and update/store `ean`.
- **Product Master vs Store History:**
  - Product master data (`product_shelf_life`) is global (`shelf_lifetime_days`).
  - Best-before dates, arrival dates, and quantities are store-specific and per-delivery (`store_product_deliveries`). NEVER overwrite existing delivery history on upsert.

## Frontend Architecture

- Follow the existing TanStack Start routing and data-loading architecture.
- Prefer server-side data loading where the existing architecture supports it.
- Do not fetch the same data independently in multiple components when a shared loader or existing data source already exists.
- Keep business logic out of presentational components when it can be shared or tested independently.
- Reuse existing UI components and design-system patterns before creating new ones.
- Every async UI flow must handle loading, success, empty, and error states where applicable.
- Do not suppress hydration warnings. Identify and fix the underlying server/client rendering mismatch.
## No Fake or Partial Implementations

- Never implement a feature visually without implementing its underlying functionality.
- Never replace real functionality with mock data, hardcoded values, simulated API responses, fake navigation, or static UI unless explicitly requested.
- Never leave dead buttons, non-functional controls, placeholder routes, empty handlers, or misleading success states.
- If a feature requires backend, database, storage, authentication, permissions, or external integration, implement the complete flow across all required layers.
- Do not mark a feature complete until the user-facing flow works end-to-end.
- If the requested feature depends on multiple layers, trace and implement the complete path: UI → application logic → database/API → persistence → UI state.
- Do not stop after implementing only the layer that is most visible to the user.

## Agent Skills

Use specialized agents when they materially improve the task, especially for:
- Large multi-file implementations
- Codebase exploration and dependency tracing
- Security and RLS audits
- Database/schema analysis
- Testing and verification
- Independent review of substantial changes

Do not delegate trivial single-file changes when doing so adds unnecessary complexity.

## Development Workflow

Before modifying code:

1. Inspect the relevant existing implementation, types, database schema, routes, components, and related tests.
2. Search the codebase for existing components, hooks, utilities, services, database functions, types, and patterns before creating new ones.
3. Identify existing patterns and reuse them instead of introducing parallel implementations.
4. Do not create duplicate implementations of existing functionality. Extend or refactor the existing implementation when appropriate.
5. Trace the complete data flow before changing it.
6. Determine whether the requested functionality is partially implemented before creating new code.
7. Keep a single source of truth for shared business logic and data transformations.
8. Make the smallest coherent change that fully solves the problem.

## Verification

After making changes:
- Run the most relevant tests and type checks.
- Run the production build when the change affects application code.
- Run database validation/migration checks when the schema or RLS policies change.
- Inspect the resulting errors instead of assuming the implementation works.
- Never report a feature as complete if verification has not been performed or if known errors remain.
- Report exactly what was changed and what verification was performed.
- Verify the actual user-facing flow for substantial UI or feature changes when possible.
- For database changes, verify the resulting schema, constraints, indexes, functions, and RLS policies rather than only confirming that the migration executed successfully.
- For authentication or authorization changes, verify both allowed and denied access paths.
- For imports and data-mapping changes, verify valid matches, fallback matches, unmatched records, duplicates, and preservation of existing historical data where applicable.