import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { KeyRound, Store, ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { supabase, setSessionToken } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/quick-login")({
  component: QuickLoginPage,
});

function QuickLoginPage() {
  const navigate = useNavigate();
  const [storeId, setStoreId] = useState("");
  const [pin, setPin] = useState("");
  const [stores, setStores] = useState<{ id: string; name: string; city?: string }[]>([]);
  const [loadingStores, setLoadingStores] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("stores").select("id, name, city").order("name");
      if (data) setStores(data);
      setLoadingStores(false);
    })();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!storeId) {
      setError("Välj en butik först.");
      return;
    }
    if (pin.length < 4) {
      setError("PIN-koden måste vara minst 4 siffror.");
      return;
    }

    setLoading(true);
    try {
      // Först: försök hitta användare via PIN + store via quick-switch edge function
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quick-switch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ mode: "pin", pin, store_id: storeId }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || "Ogiltig PIN-kod eller butik.");
        setLoading(false);
        return;
      }

      // Logga in med resultatet från quick-switch
      const user = data.user;
      const token = data.token;

      // Direkt session-lagring via auth-context (quickSwitch-funktionalitet)
      // Vi använder lokal storage + reload för att sätta session korrekt
      setSessionToken(token);
      await supabase
        .from("app_sessions")
        .update({ expires_at: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString() })
        .eq("token", token);
      navigate({ to: "/" });
    } catch (err) {
      console.error(err);
      setError("Ett fel uppstod. Försök igen.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8 md:p-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-rose-100 text-rose-600 mb-4">
            <Store size={32} />
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-foreground">
            Välj butik
          </h1>
          <p className="text-muted-foreground text-sm mt-2">För snabb inloggning på butiksdator</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <Label htmlFor="store" className="text-base">
              Butik
            </Label>
            <select
              id="store"
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              className="mt-2 w-full rounded-xl border border-input bg-background px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
              required
            >
              <option value="">Välj butik...</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.city ? ` (${s.city})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="pin" className="text-base">
              PIN-kod
            </Label>
            <div className="relative mt-2">
              <Input
                id="pin"
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="4 siffror"
                value={pin}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                  setPin(val);
                }}
                className="text-center text-2xl tracking-[0.5em] h-16 rounded-xl border-2 focus:border-rose-500 focus:ring-rose-300 font-mono"
                autoComplete="off"
              />
              <KeyRound
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground"
                size={20}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">Endast siffror. Minst 4 tecken.</p>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
              {error}
            </div>
          )}

          <Button
            type="submit"
            disabled={loading || !storeId || !pin || pin.length < 4}
            className="w-full h-16 rounded-2xl text-xl font-bold shadow-lg bg-rose-600 hover:bg-rose-700 text-white transition-all duration-200 active:scale-[0.98]"
          >
            {loading ? (
              <span className="animate-pulse">Loggar in...</span>
            ) : (
              <>
                Logga in <ArrowRight size={24} />
              </>
            )}
          </Button>
        </form>

        <div className="mt-6 pt-6 border-t border-muted text-center text-sm text-muted-foreground">
          <p>Administratör?</p>
          <Link
            to="/login"
            className="text-rose-600 hover:text-rose-700 font-medium underline underline-offset-2"
          >
            Logga in med användarnamn och lösenord
          </Link>
        </div>
      </div>
    </div>
  );
}
