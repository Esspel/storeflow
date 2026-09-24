// Edge Function: secure-login
//
// Handles app user login with rate limiting, exponential backoff, account lockout,
// and app_sessions token generation.
//
// Supports three authentication modes:
//   - "password" (default): { username, password }
//   - "pin":                 { username, pin } — same PIN verification as quick-switch
//   - "barcode":             { barcode, store_id } — employee access card scan

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { serviceRoleClient } from "../_shared/auth.ts";

const BACKOFF_MS = [0, 1000, 2000, 4000, 8000, 8000, 8000, 8000, 8000, 8000];
const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const SESSION_TTL_HOURS = 12;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    let body: {
      username?: string;
      password?: string;
      pin?: string;
      barcode?: string;
      store_id?: string;
    };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Ogiltig JSON i request-body." }, 400);
    }

    const { username, password, pin, barcode, store_id } = body;

    const usePin = pin !== undefined;
    const useBarcode = barcode !== undefined;

    if (!username && !useBarcode) {
      return json({ error: "Ange användarnamn eller skanna kort." }, 400);
    }
    if (!password && !usePin && !useBarcode) {
      return json({ error: "Ange lösenord eller PIN." }, 400);
    }

    const supabase = serviceRoleClient();

    // ── Barcode login: resolve barcode to a user ──────────────────────────────
    let resolvedUserId: string | null = null;
    if (useBarcode) {
      if (!store_id) {
        return json({ error: "store_id krävs för streckkod inloggning." }, 400);
      }
      const { data: rows } = await supabase.rpc("lookup_user_by_barcode", {
        p_barcode: barcode!,
        p_store_id: store_id,
      });
      if (!rows || rows.length === 0) {
        return json({ error: "Okänd streckkod." }, 401);
      }
      resolvedUserId = rows[0].id;
    }

    // ── Determine the username for rate-limiting (needed for both password and pin) ──
    let rateLimitUsername = username;
    if (useBarcode && !rateLimitUsername && resolvedUserId) {
      const { data: u } = await supabase
        .from("app_users")
        .select("username")
        .eq("id", resolvedUserId)
        .maybeSingle();
      if (u) rateLimitUsername = u.username;
    }

    if (!rateLimitUsername) {
      return json({ error: "Ogiltig inloggning." }, 401);
    }

    // ── Check if account is locked ────────────────────────────────────────────
    const { data: lockedUntil } = await supabase.rpc("check_account_locked", {
      p_username: rateLimitUsername,
    });

    if (lockedUntil) {
      const unlockAt = new Date(lockedUntil);
      const minutesLeft = Math.ceil((unlockAt.getTime() - Date.now()) / 60000);
      return json(
        {
          error: `Kontot är tillfälligt låst. Försök igen om ${minutesLeft} minut${minutesLeft === 1 ? "" : "er"}.`,
          locked_until: lockedUntil,
        },
        429,
        {
          "Retry-After": String(Math.ceil((unlockAt.getTime() - Date.now()) / 1000)),
        },
      );
    }

    // ── Fetch user (full columns for either username or barcode lookup) ────────
    const selectCols =
      "id, username, password_hash, quick_pin_hash, is_active, failed_login_count, locked_until, display_name, role, role_manually_set, employee_group, store_id, active_store_id, must_change_password, last_login, created_at, hierarchy_level, forening_id, distrikt_id";

    let user: Record<string, unknown> | null = null;
    let userError: unknown = null;

    if (useBarcode && resolvedUserId) {
      const res = await supabase
        .from("app_users")
        .select(selectCols)
        .eq("id", resolvedUserId)
        .eq("is_active", true)
        .maybeSingle();
      user = res.data ?? null;
      userError = res.error;
    } else if (username) {
      const res = await supabase
        .from("app_users")
        .select(selectCols)
        .eq("username", username)
        .eq("is_active", true)
        .maybeSingle();
      user = res.data ?? null;
      userError = res.error;
    }

    if (userError || !user) {
      // Record attempt for non-existent users too (prevent username enumeration timing)
      if (rateLimitUsername) {
        await supabase.rpc("record_failed_login", { p_username: rateLimitUsername });
      }
      await new Promise((r) => setTimeout(r, 500));
      return json({ error: "Ogiltigt användarnamn eller lösenord." }, 401);
    }

    // ── Exponential backoff delay based on current failed count ────────────────
    const failCount = user.failed_login_count ?? 0;
    const delay = BACKOFF_MS[Math.min(failCount as number, BACKOFF_MS.length - 1)];
    if (delay > 0) {
      await new Promise((r) => setTimeout(r, delay));
    }

    // ── Verify credentials ─────────────────────────────────────────────────────
    let verified = false;

    if (usePin) {
      // PIN login uses the same verification as quick-switch (verify_quick_pin)
      const { data: valid } = await supabase.rpc("verify_quick_pin", {
        p_user_id: user.id,
        p_pin: pin!,
      });
      verified = !!valid;
    } else if (useBarcode) {
      // Barcode login is pre-authenticated by lookup_user_by_barcode;
      // the PIN verification step is skipped (barcode is the credential)
      verified = true;
    } else {
      // Password login
      const { data: valid } = await supabase.rpc("verify_password", {
        plain_password: password!,
        hashed_password: user.password_hash,
      });
      verified = !!valid;
    }

    if (!verified) {
      if (rateLimitUsername) {
        await supabase.rpc("record_failed_login", { p_username: rateLimitUsername });
      }

      const newCount = failCount + 1;
      const remainingAttempts = MAX_ATTEMPTS - newCount;

      if (newCount >= MAX_ATTEMPTS) {
        return json(
          {
            error: `För många misslyckade försök. Kontot är låst i ${LOCKOUT_MINUTES} minuter.`,
            locked_until: new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000).toISOString(),
          },
          429,
          {
            "Retry-After": String(LOCKOUT_MINUTES * 60),
          },
        );
      }

      return json(
        {
          error: `Ogiltigt användarnamn eller lösenord.${remainingAttempts <= 2 ? ` ${remainingAttempts} försök kvar innan kontot låses.` : ""}`,
        },
        401,
      );
    }

    // ── Success — reset counter, create session ────────────────────────────────
    if (rateLimitUsername) {
      await supabase.rpc("record_successful_login", { p_username: rateLimitUsername });
    }

    const token = crypto.randomUUID() + "-" + Date.now();
    const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000).toISOString();

    await supabase.from("app_sessions").insert({
      user_id: user.id,
      token,
      expires_at: expiresAt,
    });

    const newLastLogin = new Date().toISOString();
    await supabase.from("app_users").update({ last_login: newLastLogin }).eq("id", user.id);

    const appUser = {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      role: user.role,
      role_manually_set: user.role_manually_set ?? false,
      employee_group: user.employee_group ?? "",
      store_id: user.store_id,
      active_store_id: user.active_store_id ?? null,
      is_active: user.is_active,
      must_change_password: user.must_change_password ?? false,
      last_login: newLastLogin,
      created_at: user.created_at,
      hierarchy_level: user.hierarchy_level ?? null,
      forening_id: user.forening_id ?? null,
      distrikt_id: user.distrikt_id ?? null,
    };

    return json({ user: appUser, token }, 200);
  } catch (err) {
    console.error("secure-login error:", err);
    return json({ error: "Ett fel uppstod. Försök igen." }, 500);
  }
});
