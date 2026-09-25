import { describe, it, expect } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";

/**
 * Regression test: skeleton loading loop (shows briefly, then back to skeleton again).
 *
 * Root cause: the replacement-check route reads `loading: authLoading` from useAuth
 * and __root.tsx guards on `!isClient || (loading && !isPublicRoute)`.
 * backgroundValidateAndRefresh is scheduled via a useEffect/tick that runs *after*
 * the first meaningful paint and can flip hasCheckedAuth / loading in a way that
 * re-enters the loading branch on every background tick, producing an endless
 * skelett->content->skelett cycle.
 *
 * This test pins the two invariants that break the loop:
 * 1. backgroundValidateAndRefresh must NOT return a signal that flips `hasCheckedAuth`
 *    back to a state the root-layout would treat as "not yet checked".
 * 2. ersattningcheck.tsx must gate its loading state on hasCheckedAuth (single source
 *    of truth), NOT on the auth-context `loading` flag which is tied to background ticks.
 */

const AUTH_CONTEXT = path.join(__dirname, "../auth-context.tsx");
const ERS_ROOT = path.join(__dirname, "../../routes/ersattningcheck.tsx");

describe("skeleton loading loop regression", () => {
  it("backgroundValidateAndRefresh must not set hasCheckedAuth=false on network error", () => {
    const src = fs.readFileSync(AUTH_CONTEXT, "utf-8");
    // TRUST-FIRST marker: background validation must never roll back hasCheckedAuth
    expect(
      src,
      "hasCheckedAuth must not be reset during background validation",
    ).not.toMatch(/setHasCheckedAuth\(\s*false\s*\)/);
  });

  it("ersattningcheck must guard auth-loading with hasCheckedAuth to prevent skeleton loop", () => {
    const src = fs.readFileSync(ERS_ROOT, "utf-8");
    // The condition for showing auth-loading spinner must include hasCheckedAuth
    // to prevent background tick cycles from re-triggering the spinner.
    expect(
      src,
    ).toMatch(/if\s*\(authLoading\s*&&\s*!hasCheckedAuth\)/);
  });

  it("ersattningcheck must not rely solely on auth-loading for skeleton gate", () => {
    const src = fs.readFileSync(ERS_ROOT, "utf-8");
    // There should be no bare `if (authLoading)` or `if (loading)` without hasCheckedAuth guard.
    const bareLoadingCheck = src.match(/if\s*\(\s*authLoading\s*\)\s*[^{]*\{/);
    expect(
      bareLoadingCheck,
      "ersattningcheck.tsx must not have a bare `if (authLoading)` guard without hasCheckedAuth"
    ).toBeNull();
  });
});
