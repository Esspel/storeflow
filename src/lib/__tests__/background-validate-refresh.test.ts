import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const KEY = "sf_session";
const EXPIRY_KEY = "sf_session_expires_at";

function setSession(accessToken: string, refreshToken: string, expiresAt: number) {
  sessionStorage.setItem(KEY, JSON.stringify({ access_token: accessToken, refresh_token: refreshToken, expires_at: expiresAt }));
  sessionStorage.setItem(EXPIRY_KEY, String(expiresAt));
}

function clearSession() {
  sessionStorage.removeItem(KEY);
  sessionStorage.removeItem(EXPIRY_KEY);
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
      refreshSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
    },
    from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ select: vi.fn(() => ({ order: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: null, error: null })) })), order: vi.fn(() => Promise.resolve({ data: null, error: null })) })) })) })) })),
  })),
}));

describe("backgroundValidateAndRefresh regression (bug: sets isOffline=true on first network error)", () => {
  beforeEach(() => { clearSession(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-24T10:00:00Z")); });
  afterEach(() => { clearSession(); vi.useRealTimers(); vi.restoreAllMocks(); });

  it("behåller isOffline=false när backgroundValidateAndRefresh inte har kört (ej lokal timeout)", () => {
    const FAR_FUTURE = Date.now() + 7 * 24 * 3600 * 1000;
    setSession("t", "r", FAR_FUTURE);

    const { isOffline } = validateAndRefreshSessionForTest();
    expect(isOffline).toBe(false);
  });
});
