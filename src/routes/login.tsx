import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Eye, EyeOff, KeyRound, Sparkles, Tv } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

const MIN_PW_LENGTH = 12;

function LoginPage() {
  const { login, user, refreshUser, isFirstLogin, triggerFirstTimeSetup } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Forced password change state
  const [forcePwChange, setForcePwChange] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [newPwConfirm, setNewPwConfirm] = useState("");
  const [showNewPw, setShowNewPw] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await login(username, password);
    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else if (result.mustChangePassword) {
      setForcePwChange(true);
    } else {
      navigate({ to: "/" });
    }
  };

  const handleForceChangePw = async (e: React.FormEvent) => {
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
      setError("Sessionen har gått ut. Logga in igen.");
      setForcePwChange(false);
      return;
    }
    setPwSaving(true);
    const { data: hash } = await supabase.rpc("hash_password", { plain_password: newPw });
    const { error: updateErr } = await supabase.from("app_users").update({
      password_hash: hash,
      must_change_password: false,
    }).eq("id", user.id);

    if (updateErr) {
      setError("Kunde inte spara lösenordet. Försök igen.");
      setPwSaving(false);
      return;
    }
    const updatedUser = { ...user, must_change_password: false };
    refreshUser(updatedUser);
    setPwSaving(false);

    // Show first-time setup for butikschef who have never logged in
    if (updatedUser.hierarchy_level === "chef" && isFirstLogin) {
      setForcePwChange(false);
      triggerFirstTimeSetup();
    }
    navigate({ to: "/" });
  };

  if (forcePwChange) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-md)]">
              <KeyRound className="h-7 w-7" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Byt lösenord</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Välj ett nytt lösenord för att fortsätta.
            </p>
          </div>
          <form
            onSubmit={handleForceChangePw}
            className="rounded-2xl border border-border/60 bg-card p-8 shadow-[var(--shadow-md)]"
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
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowNewPw((v) => !v)}
                    tabIndex={-1}
                  >
                    {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {newPw.length > 0 && newPw.length < MIN_PW_LENGTH && (
                  <p className="text-xs text-destructive">{newPw.length}/{MIN_PW_LENGTH} tecken</p>
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
                  <p className="text-xs text-destructive">Lösenorden stämmer inte överens.</p>
                )}
              </div>
              {error && (
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
              )}
              <Button
                type="submit"
                className="w-full rounded-full"
                disabled={pwSaving || newPw.length < MIN_PW_LENGTH || newPw !== newPwConfirm}
              >
                {pwSaving ? "Sparar..." : "Sätt nytt lösenord"}
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
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-md)]">
            <Sparkles className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">StoreFlow</h1>
          <p className="mt-1 text-sm text-muted-foreground">Logga in för att fortsätta</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-border/60 bg-card p-8 shadow-[var(--shadow-md)]"
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full rounded-full" disabled={loading}>
              {loading ? "Loggar in..." : "Logga in"}
            </Button>
          </div>
        </form>

        <div className="mt-4 text-center">
          <Link
            to="/pulstavla"
            className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-border hover:text-foreground"
          >
            <Tv className="h-3.5 w-3.5" />
            Visa Pulstavla
          </Link>
        </div>
      </div>
    </div>
  );
}
