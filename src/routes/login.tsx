import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, Store } from "lucide-react";
import { login } from "@/lib/auth";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

const schema = z.object({
  username: z.string().min(1, "Användarnamn krävs"),
  password: z.string().min(1, "Lösenord krävs"),
});

type FormData = z.infer<typeof schema>;

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(data: FormData) {
    setError(null);
    setLockedUntil(null);
    try {
      await login(data.username, data.password);
      await refreshUser();
      await navigate({ to: "/" });
    } catch (err: unknown) {
      const e = err as { message?: string; locked_until?: string };
      setError(e.message ?? "Inloggning misslyckades");
      if (e.locked_until) setLockedUntil(e.locked_until);
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center shadow-lg mb-4">
            <Store className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">StoreFlow</h1>
          <p className="text-sm text-muted-foreground mt-1">Logga in på ditt konto</p>
        </div>

        {/* Card */}
        <div className="bg-card rounded-2xl border border-border shadow-card p-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Username */}
            <div className="space-y-1.5">
              <label htmlFor="username" className="text-sm font-medium text-foreground">
                Användarnamn
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                {...register("username")}
                className={cn(
                  "w-full h-11 px-3 rounded-xl border bg-input text-sm transition-colors",
                  "focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent",
                  errors.username ? "border-destructive" : "border-border"
                )}
                placeholder="ditt.användarnamn"
              />
              {errors.username && (
                <p className="text-xs text-destructive">{errors.username.message}</p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium text-foreground">
                Lösenord
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPw ? "text" : "password"}
                  autoComplete="current-password"
                  {...register("password")}
                  className={cn(
                    "w-full h-11 px-3 pr-10 rounded-xl border bg-input text-sm transition-colors",
                    "focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent",
                    errors.password ? "border-destructive" : "border-border"
                  )}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showPw ? "Dölj lösenord" : "Visa lösenord"}
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-destructive">{errors.password.message}</p>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-3 py-2.5">
                <p className="text-sm text-destructive">{error}</p>
                {lockedUntil && (
                  <p className="text-xs text-destructive/80 mt-1">
                    Kontot låst tills: {new Intl.DateTimeFormat("sv-SE", { timeStyle: "short" }).format(new Date(lockedUntil))}
                  </p>
                )}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className={cn(
                "w-full h-11 rounded-xl bg-primary text-primary-foreground font-medium text-sm",
                "transition-all active:scale-[0.98]",
                isSubmitting ? "opacity-70 cursor-not-allowed" : "hover:opacity-90"
              )}
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                  Loggar in...
                </span>
              ) : "Logga in"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          StoreFlow © {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
