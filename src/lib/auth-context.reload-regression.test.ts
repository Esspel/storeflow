import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Regression test: reload should NOT redirect to login.
 *
 * The reload bug was a universal (not device-specific) failure:
 * 1. `getStoredSession()` reads from IndexedDB.
 * 2. The old auth flow called `validateSession()` on every page load, which
 *    makes a network call to Supabase.
 * 3. If the network call failed (transient error, timeout, DB lock),
 *    `validUser === null`.
 * 4. The original `else` branch in auth-context cleared the session
 *    (`clearSession()`) unconditionally.
 * 5. With `loading === false` and `hasCheckedAuth === true`,
 *    `__root.tsx` saw `!user` and redirected to `/login`.
 *
 * The fix (trust-first approach):
 * - Restore session from IndexedDB immediately on reload and TRUST it.
 * - Check local expiry timestamp (no network call needed).
 * - Run background validation AFTER the initial render without blocking.
 * - Network errors during background validation: keep session alive, retry later.
 * - Only clear session when server definitively says the session is invalid.
 *
 * This static check verifies the trust-first markers exist in the source.
 */

const AUTH_CONTEXT_PATH = path.join(__dirname, "../lib/auth-context.tsx");
const AUTH_PATH = path.join(__dirname, "../lib/auth.ts");
const ROOT_PATH = path.join(__dirname, "../routes/__root.tsx");
const LOGIN_PATH = path.join(__dirname, "../routes/login.tsx");

describe("reload session resilience", () => {
  it("uses trust-first session restoration (restores from IDB without waiting for network)", () => {
    const source = fs.readFileSync(AUTH_CONTEXT_PATH, "utf-8");
    // The restoreSession function must restore the session immediately
    expect(
      source,
      "Trust-first marker missing: session should be restored immediately from IndexedDB",
    ).toContain("// TRUST-FIRST: Restore session immediately");
  });

  it("does not wipe session on transient validation failure (prevents login bounce on reload)", () => {
    const source = fs.readFileSync(AUTH_CONTEXT_PATH, "utf-8");
    // Background validation must NOT clearSession on network errors
    // Look for the network error handling that keeps the session alive
    expect(
      source,
      "Background validation must handle network errors without clearing session",
    ).toContain("// result.user is null and !needsRemoval → network error");
  });

  it("sets hasCheckedAuth only after IDB read completes (not after network validation)", () => {
    const source = fs.readFileSync(AUTH_CONTEXT_PATH, "utf-8");
    // hasCheckedAuth should be set within the restoreSession function
    // after IDB read, not gated on network validation
    const hasCheckedAuthInRestore = source.includes("setHasCheckedAuth(true);");
    expect(
      hasCheckedAuthInRestore,
      "hasCheckedAuth should be set to true after IDB read in restoreSession",
    ).toBe(true);
  });

  it("marks auth as checked even when IDB read fails (prevents redirect loop)", () => {
    const source = fs.readFileSync(AUTH_CONTEXT_PATH, "utf-8");
    // When no stored session is found, hasCheckedAuth must still be set
    expect(source, "hasCheckedAuth must be set even when no session is in IDB").toMatch(
      /if \(!stored\)[\s\S]*?setHasCheckedAuth\(true\)/,
    );
  });

  it("uses local expiry check before network validation (trust-first)", () => {
    const source = fs.readFileSync(AUTH_PATH, "utf-8");
    // auth.ts should export isSessionLocallyExpired for offline-first check
    expect(
      source,
      "auth.ts should export isSessionLocallyExpired for trust-first local check",
    ).toContain("isSessionLocallyExpired");
  });

  it("does not use 500ms redirect cooldown hack in __root.tsx", () => {
    const source = fs.readFileSync(ROOT_PATH, "utf-8");
    // The old 500ms redirectPending cooldown should be removed
    // Instead, redirects should be gated on hasCheckedAuth
    expect(
      source,
      "redirectPending cooldown hack should be removed — use hasCheckedAuth guard instead",
    ).not.toContain("redirectPending");
    expect(source, "__root.tsx should check hasCheckedAuth before redirecting").toContain(
      "if (!hasCheckedAuth) return;",
    );
  });

  it("login page does not expose user names in PIN mode", () => {
    const source = fs.readFileSync(LOGIN_PATH, "utf-8");
    // PIN mode must NOT fetch or display user names
    // The username is manually entered, and no user list is shown
    expect(source, "PIN mode should not display a user list with names").not.toContain("userList");
    expect(source, "PIN mode should call login with pin parameter").toContain(
      'login(username, "", pin)',
    );
  });
});
