import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Store, ArrowRight } from "lucide-react";
import { supabase, setSessionToken } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [autoStoreName, setAutoStoreName] = useState<string | null>(null);

  // 1. Hämta butiker
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("stores").select("id, name, city").order("name");
      if (data) setStores(data);
    })();
  }, []);

  // 2. IP-Identifiering (Körs endast en gång vid mount)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("https://zjongicwgixyvysqpawj.supabase.co/functions/v1/get-public-ip").catch(() => null);
        if (!res || !res.ok) return;
        const json = await res.json();
        if (!json.ip) return;

        const { data: ipMatch } = await supabase
          .from("store_ips")
          .select("store_id, stores(name)")
          .eq("ip_address", json.ip)
          .maybeSingle();

        if (ipMatch?.store_id) {
          setStoreId(ipMatch.store_id);
          // @ts-ignore om relationen är konfigurerad i Supabase
          if (ipMatch.stores?.name) setAutoStoreName(ipMatch.stores.name);
        }
      } catch {
        // Ignorera IP-fel
      }
    })();
  }, []);

  // 3. Hämta användare för vald butik
  useEffect(() => {
    if (!storeId) {
      setUsers([]);
      setUserId("");
      return;
    }

    (async () => {
      setUserId(""); // Nollställ vald användare när butik ändras

      // Hämta användare kopplade via user_stores för butiken
      const userStoresRes = await supabase
        .from("user_stores")
        .select("user_id")
        .eq("store_id", storeId);

      // Hämta användare via direct store_id på app_users (primär butik)
      const directUsersRes = await supabase
        .from("app_users_public_lookup")
        .select("id, username, display_name")
        .eq("store_id", storeId)
        .eq("is_active", true);

      // Hämta användare från user_stores-listan via app_users_public_lookup
      const userIds = (userStoresRes.data || []).map((row: any) => row.user_id);
      const usersFromStoresRes = userIds.length > 0
        ? await supabase
            .from("app_users_public_lookup")
            .select("id, username, display_name")
            .in("id", userIds)
            .eq("is_active", true)
        : { data: [] };

      const usersFromStores = usersFromStoresRes.data || [];
      const directUsers = directUsersRes.data || [];

      // Slå ihop och ta bort dubbletter baserat på id
      const combinedMap = new Map<string, { id: string; username: string; display_name: string }>();
      [...usersFromStores, ...directUsers].forEach((u) => {
        if (u && u.id) combinedMap.set(u.id, u);
      });

      const uniqueUsers = Array.from(combinedMap.values()).sort((a, b) =>
        (a.display_name || a.username).localeCompare(b.display_name || b.username)
      );

      setUsers(uniqueUsers);
    })();
  }, [storeId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!storeId) return setError("Välj en butik först.");
    if (!userId) return setError("Välj en användare.");
    if (pin.length < 4) return setError("PIN-koden måste vara minst 4 siffror.");

    setLoading(true);
    try {
      const res = await fetch(`https://zjongicwgixyvysqpawj.supabase.co/functions/v1/quick-switch`, {
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
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-coop-gron-100 text-coop-gron-700 mb-4">
            <Store size={32} />
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-coop-gray-900">
            Välj butik
          </h1>
          <p className="text-coop-gray-600 text-sm mt-2">För snabb inloggning på butiksdator</p>
          {autoStoreName && (
            <p className="text-xs text-coop-gron-700 font-medium mt-1">
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
              className="mt-2 w-full rounded-xl border border-coop-gray-300 bg-white px-4 py-3 text-base text-coop-gray-900 focus:outline-none focus:ring-2 focus:ring-coop-gron-500 focus:ring-offset-1"
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
              className="mt-2 w-full rounded-xl border border-coop-gray-300 bg-white px-4 py-3 text-base text-coop-gray-900 focus:outline-none focus:ring-2 focus:ring-coop-gron-500 focus:ring-offset-1 disabled:opacity-50"
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
            <div className="mt-2 text-center">
              {/* PIN dots */}
              <div className="flex justify-center gap-3 mb-3">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={`h-3 w-3 rounded-full border-2 transition-all duration-100 ${pin.length > i ? "border-coop-gron-600 bg-coop-gron-600 scale-110" : "border-coop-gray-300 bg-transparent"}`}
                  />
                ))}
              </div>
              <p className="text-xs text-coop-gray-600 mb-3">Ange din 4-siffriga PIN</p>
            </div>
            {/* PIN pad */}
            <div className="grid grid-cols-3 gap-3">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                <button
                  key={d}
                  onClick={() => {
                    if (pin.length >= 4 || loading) return;
                    setPin(pin + d);
                    setError("");
                  }}
                  disabled={loading || pin.length >= 4}
                  className="flex h-14 items-center justify-center rounded-2xl border border-coop-gray-300 bg-coop-gray-50 text-xl font-semibold text-coop-gray-900 transition-all active:scale-95 hover:bg-coop-gray-100 disabled:opacity-50"
                >
                  {d}
                </button>
              ))}
              <button
                onClick={() => {
                  setPin("");
                  setError("");
                }}
                disabled={loading}
                className="flex h-14 items-center justify-center rounded-2xl text-xs font-medium text-coop-gray-600 transition-all hover:bg-coop-gray-100 disabled:opacity-50"
              >
                Rensa
              </button>
              <button
                onClick={() => {
                  if (pin.length < 4 && !loading) setPin(pin + "0");
                  setError("");
                }}
                disabled={loading || pin.length >= 4}
                className="flex h-14 items-center justify-center rounded-2xl border border-coop-gray-300 bg-coop-gray-50 text-xl font-semibold text-coop-gray-900 transition-all active:scale-95 hover:bg-coop-gray-100 disabled:opacity-50"
              >
                0
              </button>
            </div>
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
            className="w-full h-16 rounded-2xl text-xl font-bold shadow-lg bg-coop-gron-600 hover:bg-coop-gron-700 text-white transition-all duration-200 active:scale-[0.98]"
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
            className="text-coop-gron-700 hover:text-coop-gron-800 font-medium underline underline-offset-2"
          >
            Logga in med användarnamn och lösenord
          </Link>
        </div>
      </div>
    </div>
  );
}
