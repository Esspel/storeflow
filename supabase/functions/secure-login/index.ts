// Edge Function: secure-login
//
// Handles app user login with rate limiting, exponential backoff, account lockout,
// password verification via RPC, and app_sessions token generation.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { serviceRoleClient } from "../_shared/auth.ts";

// Exponential backoff delays per failed attempt (0-indexed, capped at 8s)
const BACKOFF_MS = [0, 1000, 2000, 4000, 8000, 8000, 8000, 8000, 8000, 8000];
const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    let body: { username?: string; password?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Ogiltig JSON i request-body." }, 400);
    }

    const { username, password } = body;

    if (!username || !password) {
      return json({ error: "Ogiltigt användarnamn eller lösenord." }, 400);
    }

    // 1. Skapa serviceRoleClient via det gemensamma auth-biblioteket
    const supabase = serviceRoleClient();

    // 2. Check if account is locked
    const { data: lockedUntil } = await supabase.rpc("check_account_locked", {
      p_username: username,
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
        }
      );
    }

    // 3. Fetch user
    const { data: user, error: userError } = await supabase
      .from("app_users")
      .select("id, username, password_hash, is_active, failed_login_count, locked_until, display_name, role, role_manually_set, employee_group, store_id, active_store_id, must_change_password, last_login, created_at, hierarchy_level, forening_id, distrikt_id")
      .eq("username", username)
      .eq("is_active", true)
      .maybeSingle();

    if (userError || !user) {
      // Record attempt for non-existent users too (prevent username enumeration timing)
      await supabase.rpc("record_failed_login", { p_username: username });
      // Small fixed delay for non-existent users
      await new Promise((r) => setTimeout(r, 500));
      return json({ error: "Ogiltigt användarnamn eller lösenord." }, 401);
    }

    // 4. Exponential backoff delay based on current failed count
    const failCount = user.failed_login_count ?? 0;
    const delay = BACKOFF_MS[Math.min(failCount, BACKOFF_MS.length - 1)];
    if (delay > 0) {
      await new Promise((r) => setTimeout(r, delay));
    }

    // 5. Verify password
    const { data: verified } = await supabase.rpc("verify_password", {
      plain_password: password,
      hashed_password: user.password_hash,
    });

    if (!verified) {
      await supabase.rpc("record_failed_login", { p_username: username });

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
          }
        );
      }

      return json(
        {
          error: `Ogiltigt användarnamn eller lösenord.${remainingAttempts <= 2 ? ` ${remainingAttempts} försök kvar innan kontot låses.` : ""}`,
        },
        401
      );
    }

    // 6. Success — reset counter, create session
    await supabase.rpc("record_successful_login", { p_username: username });

    const token = crypto.randomUUID() + "-" + Date.now();
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();

    await supabase.from("app_sessions").insert({
      user_id: user.id,
      token,
      expires_at: expiresAt,
    });

    await supabase
      .from("app_users")
      .update({ last_login: new Date().toISOString() })
      .eq("id", user.id);

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
      last_login: user.last_login,
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
