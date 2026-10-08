import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { KeyRound, Store, ArrowRight, User } from "lucide-react";
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
  const [userId, setUserId] = useState("");
  const [pin, setPin] = useState("");
  const [stores, setStores] = useState<{ id: string; name: string; city?: string }[]>([]);
  const [users, setUsers] = useState<{ id: string; username: string; display_name: string }[]>([]);
  const [loadingStores, setLoadingStores] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [autoStoreName, setAutoStoreName] = useState<string | null>(null);

  // Hämta butiker
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("stores").select("id, name, city").order("name");
      if (data) setStores(data);
      setLoadingStores(false);
    })();
  }, []);

  // Auto-identifiera butik via IP (om store_ips finns)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("https://api.ipify.org?format=json").catch(() => null);
        const myIp = res ? (await res.json()).ip : null;
        if (!myIp) return;
        const { data: ipMatch } = await supabase
          .from("store_ips")
          .select("store_id")
          .eq("ip_address", myIp)
          .limit(1);
        if (ipMatch && ipMatch.length > 0) {
          setStoreId(ipMatch[0].store_id);
          const storeData = stores.find((s) => s.id === ipMatch[0].store_id);
          if (storeData) setAutoStoreName(storeData.name);
        }
      } catch {
        // Ignorera IP-fel
      }
    })();
  }, [stores]);

  // Hämta användare när butik valts
  useEffect(() => {
    if (!storeId) {
      setUsers([]);
      setUserId("");
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("app_users")
        .select("id, username, display_name")
        .eq("store_id", storeId)
        .order("display_name");
      if (data) setUsers(data);
    })();
  }, [storeId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!storeId) {
      setError("Välj en butik först.");
      return;
    }
    if (!userId) {
      setError("Välj en användare.");
      return;
    }
    if (pin.length < 4) {
      setError("PIN-koden måste vara minst 4 siffror.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/functions/v1/quick-switch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ mode: "pin", user_id: userId, pin, store_id: storeId }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || "Ogiltig PIN-kod eller butik.");
        setLoading(false);
        return;
      }
      setSessionToken(data.token);
      navigate({ to: "/" });
    } catch (err) {
      console.error(err);
      setError("Ett fel uppstod. Försök igen.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-coop-gray-100 flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8 md:p-10 border border-coop-gray-200">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-coop-green-100 text-coop-green-700 mb-4">
            <Store size={32} />
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-coop-gray-900">
            Välj butik
          </h1>
          <p className="text-coop-gray-600 text-sm mt-2">För snabb inloggning på butiksdator</p>
          {autoStoreName && (
            <p className="text-xs text-coop-green-700 font-medium mt-1">
              Automatiskt identifierad: {autoStoreName}
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <Label htmlFor="store" className="text-base text-coop-gray-900">
              Butik
            </Label>
            <select
              id="store"
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              className="mt-2 w-full rounded-xl border border-coop-gray-300 bg-white px-4 py-3 text-base text-coop-gray-900 focus:outline-none focus:ring-2 focus:ring-coop-green-500 focus:ring-offset-1"
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
            <Label htmlFor="user" className="text-base text-coop-gray-900">
              Användare
            </Label>
            <select
              id="user"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              disabled={!storeId}
              className="mt-2 w-full rounded-xl border border-coop-gray-300 bg-white px-4 py-3 text-base text-coop-gray-900 focus:outline-none focus:ring-2 focus:ring-coop-green-500 focus:ring-offset-1 disabled:opacity-50"
              required
            >
              <option value="">Välj användare...</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.display_name || u.username}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="pin" className="text-base text-coop-gray-900">
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
                className="text-center text-2xl tracking-[0.5em] h-16 rounded-xl border-2 border-coop-gray-300 focus:border-coop-green-600 focus:ring-coop-green-300 font-mono bg-coop-gray-50 text-coop-gray-900"
                autoComplete="off"
              />
              <KeyRound
                className="absolute right-4 top-1/2 -translate-y-1/2 text-coop-gray-500"
                size={20}
              />
            </div>
            <p className="text-xs text-coop-gray-500 mt-2">Endast siffror. Minst 4 tecken.</p>
          </div>

          {error && (
            <div
              className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200"
              role="alert"
            >
              {error}
            </div>
          )}

          <Button
            type="submit"
            disabled={loading || !storeId || !userId || !pin || pin.length < 4}
            className="w-full h-16 rounded-2xl text-xl font-bold shadow-lg bg-coop-green-600 hover:bg-coop-green-700 text-white transition-all duration-200 active:scale-[0.98]"
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

        <div className="mt-6 pt-6 border-t border-coop-gray-200 text-center text-sm text-coop-gray-600">
          <p>Administratör?</p>
          <Link
            to="/login"
            className="text-coop-green-700 hover:text-coop-green-800 font-medium underline underline-offset-2"
          >
            Logga in med användarnamn och lösenord
          </Link>
        </div>
      </div>
    </div>
  );
}
