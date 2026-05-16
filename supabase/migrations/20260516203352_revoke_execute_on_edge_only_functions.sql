/*
  # Revoke direct RPC access on functions only called by edge functions

  ## Problem
  Several SECURITY DEFINER functions are exposed via PostgREST /rpc/ endpoint
  even though they should only be called by edge functions (which use service_role).
  This allows unauthenticated users to call sensitive functions like
  record_failed_login or lookup_user_by_barcode directly.

  ## Solution
  1. Revoke EXECUTE from anon/authenticated on functions called ONLY by edge
     functions (which use service_role and bypass privilege checks).
  2. For RLS helper functions (app_current_user_id, etc.): these MUST remain
     callable by anon because PostgreSQL requires EXECUTE privilege on functions
     referenced in RLS policy expressions. They are safe because they only
     return the caller's own session data.
  3. For analytics functions: add internal admin checks (already present) and
     keep callable since frontend needs them.

  ## Changes
  - record_failed_login: revoke from anon, authenticated
  - record_successful_login: revoke from anon, authenticated
  - check_account_locked: revoke from anon, authenticated
  - lookup_user_by_barcode: revoke from anon, authenticated
  - verify_quick_pin: revoke from anon, authenticated

  ## Security Notes
  - Edge functions use SUPABASE_SERVICE_ROLE_KEY which bypasses all privilege checks
  - RLS helper functions cannot be revoked without breaking all row-level security
  - Analytics functions already check app_current_user_role() = 'admin' internally
*/

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. Functions called ONLY by edge functions (service_role) — safe to revoke
-- ═══════════════════════════════════════════════════════════════════════════════

-- Login attempt tracking (called by secure-login edge function)
REVOKE EXECUTE ON FUNCTION public.record_failed_login(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_successful_login(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_account_locked(text) FROM anon, authenticated;

-- Quick-switch authentication (called by quick-switch edge function)
REVOKE EXECUTE ON FUNCTION public.lookup_user_by_barcode(text, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.verify_quick_pin(uuid, text) FROM anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. RLS helper functions — MUST remain callable by anon
-- These are referenced in 100+ RLS policy expressions. PostgreSQL requires
-- the calling role to have EXECUTE privilege on functions in policy quals.
-- They are safe: they only read/return the caller's own session data.
--
-- Kept callable (intentional):
--   app_current_user_id()
--   app_current_user_role()
--   app_current_store_id()
--   app_user_store_ids()
--   app_is_admin()
--   app_user_manages_store(uuid)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. Analytics functions — Keep callable, already have internal admin checks
-- The frontend calls get_national_stats, get_regional_performance,
-- get_store_performance_by_region via supabase.rpc() with anon key.
-- Each function already checks app_current_user_role() = 'admin' internally
-- or returns empty results for non-admins. Safe to keep.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. hash_password / verify_password — MUST remain callable by anon
-- The frontend calls these directly for password changes and PIN setup.
-- They are pure utility functions (bcrypt hash/verify) with no data access.
-- ═══════════════════════════════════════════════════════════════════════════════
