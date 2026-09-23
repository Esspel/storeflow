import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, KeyRound, Sparkles } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

const MIN_PW_LENGTH = 12;

type LoginMode = "password" | "pin";

function LoginPage() {
  const { login, user, refreshUser, isFirstLogin, triggerFirstTimeSetup } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<LoginMode>("password");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Forced password change state
  const [forcePwChange, setForcePwChange] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [newPwConfirm, setNewPwConfirm] = useState("");
  const [showNewPw, setShowNewPw] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (mode === "pin") {
        const result = await login(username, "", pin);
        if (result.error) {
          setError(result.error);
        } else if (result.mustChangePassword) {
          setForcePwChange(true);
        } else {
          navigate({ to: "/" });
        }
      } else {
        const result = await login(username, password);
        if (result.error) {
          setError(result.error);
        } else if (result.mustChangePassword) {
          setForcePwChange(true);
        } else {
          navigate({ to: "/" });
        }
      }
    } catch (err) {
      console.error("Login error:", err);
      setError("Ett oväntat fel uppstod vid inloggning.");
    } finally {
      setLoading(false);
    }
  };

  const handlePinDigit = (digit: string) => {
    if (pin.length >= 4 || loading) return;
    const next = pin + digit;
    setPin(next);
    setError("");
    if (next.length === 4 && username) {
      handleSubmit({ preventDefault: () => {} } as React.FormEvent<HTMLFormElement>);
    }
  };

  const handlePinDelete = () => {
    setPin((p) => p.slice(0, -1));
    setError("");
  };

  const handleForceChangePw = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    if (newPw.length < MIN_PW_LENGTH) {
      setError(`Lösenordet måste vara minst ${MIN_PW_LENGTH} tecken.`);
      return;
    }
    if (newPw !== newPwConfirm) {
      setError("Lösenorden stämmer inte överens.");
      return;
    }
    if (!user) {
      setError("Sessionen har gångit ut. Logga in igen.");
      setForcePwChange(false);
      return;
    }

    setPwSaving(true);
    try {
      const { data: hash, error: hashErr } = await supabase.rpc("hash_password", {
        plain_password: newPw,
      });

      if (hashErr || !hash) {
        setError("Kunde inte generera lösenordshash. Försök igen.");
        setPwSaving(false);
        return;
      }

      const { error: updateErr } = await supabase
        .from("app_users")
        .update({
          password_hash: hash,
          must_change_password: false,
        })
        .eq("id", user.id);

      if (updateErr) {
        setError("Kunde inte spara lösenordet. Försök igen.");
        setPwSaving(false);
        return;
      }

      const updatedUser = { ...user, must_change_password: false };
      refreshUser(updatedUser);

      // Show first-time setup for store managers who have never logged in
      if (updatedUser.hierarchy_level === "chef" && isFirstLogin) {
        setForcePwChange(false);
        triggerFirstTimeSetup();
      }

      navigate({ to: "/" });
    } catch (err) {
      console.error("Password update error:", err);
      setError("Ett fel uppstod när lösenordet skulle sparas.");
    } finally {
      setPwSaving(false);
    }
  };

  if (forcePwChange) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-coop-gradient text-primary-foreground shadow-[var(--shadow-md)]">
              <KeyRound className="h-7 w-7" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Byt lösenord</h1>
            <p className="mt-1 text-sm text-coop-gray-900">
              Välj ett nytt lösenord för att fortsätta.
            </p>
          </div>

          <form
            onSubmit={handleForceChangePw}
            className="rounded-2xl border border-border/60 bg-coop-gray-100 p-8 shadow-[var(--shadow-md)]"
          >
            <div className="space-y-5">
              <div className="rounded-lg bg-warning/15 px-4 py-3 text-sm text-warning-foreground">
                Ditt konto kräver att du skapar ett nytt lösenord på minst {MIN_PW_LENGTH} tecken.
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-pw">Nytt lösenord</Label>
                <div className="relative">
                  <Input
                    id="new-pw"
                    type={showNewPw ? "text" : "password"}
                    placeholder={`Minst ${MIN_PW_LENGTH} tecken`}
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    required
                    autoComplete="new-password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-coop-gray-900 hover:text-coop-gray-900"
                    onClick={() => setShowNewPw((v) => !v)}
                    aria-label={showNewPw ? "Dölj lösenord" : "Visa lösenord"}
                    aria-pressed={showNewPw}
                  >
                    {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {newPw.length > 0 && newPw.length < MIN_PW_LENGTH && (
                  <p className="text-xs tabular-nums text-destructive" aria-live="polite">
                    {newPw.length}/{MIN_PW_LENGTH} tecken
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-pw">Bekräfta lösenord</Label>
                <Input
                  id="confirm-pw"
                  type="password"
                  placeholder="Upprepa lösenordet"
                  value={newPwConfirm}
                  onChange={(e) => setNewPwConfirm(e.target.value)}
                  required
                  autoComplete="new-password"
                />
                {newPwConfirm.length > 0 && newPw !== newPwConfirm && (
                  <p className="text-xs text-destructive" aria-live="polite">
                    Lösenorden stämmer inte överens.
                  </p>
                )}
              </div>

              {error && (
                <p
                  role="alert"
                  aria-live="polite"
                  className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {error}
                </p>
              )}

              <Button
                type="submit"
                className="w-full rounded-full"
                disabled={pwSaving || newPw.length < MIN_PW_LENGTH || newPw !== newPwConfirm}
              >
                {pwSaving ? "Sparar…" : "Sätt nytt lösenord"}
                {pwSaving && (
                  <span className="sr-only" aria-busy="true">
                    Laddar…
                  </span>
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-coop-gradient text-primary-foreground shadow-[var(--shadow-md)]">
            <Sparkles className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">StoreFlow</h1>
          <p className="mt-1 text-sm text-coop-gray-900">Logga in för att fortsätta</p>
        </div>

        {/* Mode toggle — PIN uses the same verification as Snabbbytet (quick switch) */}
        <div className="mb-4 flex justify-center gap-1">
          <button
            type="button"
            onClick={() => {
              setMode("password");
              setError("");
              setUsername("");
              setPassword("");
              setPin("");
            }}
            className={cn(
              "flex-1 rounded-full px-4 py-2 text-sm font-medium transition-all",
              mode === "password"
                ? "bg-primary text-primary-foreground"
                : "bg-transparent text-coop-gray-900 hover:bg-muted",
            )}
          >
            Lösenord
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("pin");
              setError("");
              setUsername("");
              setPassword("");
              setPin("");
            }}
            className={cn(
              "flex-1 rounded-full px-4 py-2 text-sm font-medium transition-all",
              mode === "pin"
                ? "bg-primary text-primary-foreground"
                : "bg-transparent text-coop-gray-900 hover:bg-muted",
            )}
          >
            PIN
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-border/60 bg-coop-gray-100 p-8 shadow-[var(--shadow-md)]"
        >
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="username">Användarnamn</Label>
              <Input
                id="username"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="Ange ditt användarnamn"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>

            {mode === "password" ? (
              <div className="space-y-2">
                <Label htmlFor="password">Lösenord</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-coop-gray-900 hover:text-coop-gray-900"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Dölj lösenord" : "Visa lösenord"}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="pin">PIN-kod</Label>
                <p className="text-xs text-coop-gray-900">
                  Ange din 4-siffriga PIN (samma som Snabbbytet)
                </p>
                <div className="flex justify-center gap-2 py-2">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className={cn(
                        "h-3 w-3 rounded-full border-2 transition-all",
                        pin.length > i
                          ? "border-primary bg-primary"
                          : "border-border bg-transparent",
                      )}
                    />
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => handlePinDigit(d)}
                      disabled={loading || pin.length >= 4}
                      className="h-12 w-full rounded-xl border border-border/60 bg-coop-gray-100 text-xl font-semibold text-coop-gray-900 transition-all hover:bg-accent active:scale-95 active:bg-muted disabled:opacity-50"
                    >
                      {d}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setMode("password");
                      setPin("");
                      setError("");
                    }}
                    disabled={loading}
                    className="h-12 w-full rounded-xl text-xs text-coop-gray-900 transition-all hover:bg-muted active:scale-95 disabled:opacity-50"
                  >
                    Tillbaka
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePinDigit("0")}
                    disabled={loading || pin.length >= 4}
                    className="h-12 w-full rounded-xl border border-border/60 bg-coop-gray-100 text-xl font-semibold text-coop-gray-900 transition-all hover:bg-accent active:scale-95 active:bg-muted disabled:opacity-50"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    onClick={handlePinDelete}
                    disabled={loading || pin.length === 0}
                    className="h-12 w-full rounded-xl text-coop-gray-900 transition-all hover:bg-muted active:scale-95 disabled:opacity-50"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="mx-auto"
                    >
                      <path d="M22.53 12c-1.75-4.66-6.08-8-10.53-8-4.45 0-8.78 3.34-10.53 8-1.75 4.66.12 9.86 4.87 12.27 1.04.59 2.26.9 3.56.9 4.45 0 8.78-3.34 10.53-8 1.75-4.66-.12-9.86-4.87-12.27z" />
                      <path d="M12 8v4l2 2" />
                      <circle cx="12" cy="12" r="10" />
                    </svg>
                  </button>
                </div>
              </div>
            )}

            {error && (
              <p
                role="alert"
                aria-live="polite"
                className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            )}

            {mode === "pin" && (
              <p className="text-xs text-coop-gray-900">
                Ingen person visas på denna sida. Dina kunduppgifter är skyddade.
              </p>
            )}

            <Button type="submit" className="w-full rounded-full" disabled={loading}>
              {loading ? "Loggar in…" : mode === "pin" ? "Logga in med PIN" : "Logga in"}
              {loading && (
                <span className="sr-only" aria-busy="true">
                  Laddar…
                </span>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
