import { useCallback, useEffect, useRef, useState } from "react";
import { Delete, ScanBarcode, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";
import { supabase, type AppUser } from "@/lib/supabase";

const QUICK_SWITCH_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quick-switch`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

type Props = {
  currentUser: AppUser;
  activeStoreId: string | null;
  onUnlock: (user: AppUser, token: string) => void;
  onCancel: () => void;
};

type SwitchMode = "choose" | "pin" | "barcode_waiting";

// Compact list of store users shown for PIN selection
type QuickUser = {
  id: string;
  display_name: string;
  role: string;
  has_pin: boolean;
  has_barcode: boolean;
};

export function LockScreen({ currentUser, activeStoreId, onUnlock, onCancel }: Props) {
  const [mode, setMode] = useState<SwitchMode>("choose");
  const [selectedUser, setSelectedUser] = useState<QuickUser | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [storeUsers, setStoreUsers] = useState<QuickUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const pinRef = useRef(pin);
  pinRef.current = pin;

  // Load users in this store who have PIN or barcode configured
  useEffect(() => {
    if (!activeStoreId) return;
    setLoadingUsers(true);
    supabase
      .from("user_stores")
      .select("user:app_users(id, display_name, role, quick_pin_hash, barcode_id)")
      .eq("store_id", activeStoreId)
      .then(({ data }) => {
        const users = (data ?? [])
          .map((r: { user: unknown }) => r.user as { id: string; display_name: string; role: string; quick_pin_hash: string | null; barcode_id: string | null })
          .filter(Boolean)
          .filter((u) => u.id !== currentUser.id)
          .map((u) => ({
            id: u.id,
            display_name: u.display_name,
            role: u.role,
            has_pin: !!u.quick_pin_hash,
            has_barcode: !!u.barcode_id,
          }));
        setStoreUsers(users);
        setLoadingUsers(false);
      });
  }, [activeStoreId, currentUser.id]);

  const submitSwitch = useCallback(async (opts: { mode: "pin"; userId: string; pin: string } | { mode: "barcode"; barcode: string }) => {
    if (!activeStoreId) return;
    setLoading(true);
    setError("");

    try {
      const body = opts.mode === "pin"
        ? { mode: "pin", user_id: opts.userId, pin: opts.pin, store_id: activeStoreId }
        : { mode: "barcode", barcode: opts.barcode, store_id: activeStoreId };

      const res = await fetch(QUICK_SWITCH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON_KEY}` },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error ?? "Autentisering misslyckades.");
        setPin("");
        setLoading(false);
        return;
      }

      onUnlock(data.user as AppUser, data.token);
    } catch {
      setError("Kan inte ansluta. Kontrollera nätverket.");
      setLoading(false);
    }
  }, [activeStoreId, onUnlock]);

  // Barcode scanner — fires when hardware scanner sends barcode
  useBarcodeScanner({
    onScan: useCallback((code: string) => {
      if (loading) return;
      submitSwitch({ mode: "barcode", barcode: code });
    }, [loading, submitSwitch]),
    acceptAlpha: true,
  });

  const handlePinDigit = (digit: string) => {
    if (pin.length >= 4 || loading) return;
    const next = pin + digit;
    setPin(next);
    setError("");
    if (next.length === 4 && selectedUser) {
      submitSwitch({ mode: "pin", userId: selectedUser.id, pin: next });
    }
  };

  const handlePinDelete = () => {
    setPin((p) => p.slice(0, -1));
    setError("");
  };

  const initials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const roleLabel: Record<string, string> = { admin: "Admin", manager: "Chef", employee: "Anställd" };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-5 py-4">
        <div className="flex flex-col">
          <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Store</span>
          <span className="text-xl font-black tracking-tight text-primary">Flow</span>
        </div>
        <button
          onClick={onCancel}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border/60 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Avbryt"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="w-full max-w-sm px-6">

        {mode === "choose" && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-[13px] font-bold text-primary-foreground">
                  {initials(currentUser.display_name)}
                </div>
              </div>
              <p className="text-sm text-muted-foreground">Inloggad som</p>
              <p className="font-semibold">{currentUser.display_name}</p>
              <p className="mt-4 text-base font-semibold">Vem tar över enheten?</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Scanna ditt kort eller välj ditt namn för PIN</p>
            </div>

            {/* Barcode hint */}
            <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-3">
              <ScanBarcode className="h-5 w-5 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-medium">Scanna passerkort</p>
                <p className="text-xs text-muted-foreground">Rikta Zebra-skannern mot streckkoden på ditt kort</p>
              </div>
            </div>

            {/* User list for PIN */}
            {loadingUsers ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-14 animate-pulse rounded-xl bg-muted" />
                ))}
              </div>
            ) : storeUsers.filter((u) => u.has_pin).length > 0 ? (
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Logga in med PIN</p>
                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {storeUsers.filter((u) => u.has_pin).map((u) => (
                    <button
                      key={u.id}
                      onClick={() => { setSelectedUser(u); setMode("pin"); setPin(""); setError(""); }}
                      className="flex w-full items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-3 text-left transition-colors hover:bg-accent active:scale-[0.98]"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary">
                        {initials(u.display_name)}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{u.display_name}</p>
                        <p className="text-xs text-muted-foreground">{roleLabel[u.role] ?? u.role}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-center text-xs text-muted-foreground">
                Inga kollegor med PIN hittades i denna butik.
              </p>
            )}
          </div>
        )}

        {mode === "pin" && selectedUser && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary-soft text-xl font-bold text-primary">
                {initials(selectedUser.display_name)}
              </div>
              <p className="font-semibold">{selectedUser.display_name}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">Ange din 4-siffriga PIN</p>
            </div>

            {/* PIN dots */}
            <div className="flex justify-center gap-4">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={cn(
                    "h-4 w-4 rounded-full border-2 transition-all duration-100",
                    pin.length > i
                      ? "border-primary bg-primary scale-110"
                      : "border-border bg-transparent",
                  )}
                />
              ))}
            </div>

            {error && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">{error}</p>
            )}

            {/* PIN pad */}
            <div className="grid grid-cols-3 gap-3">
              {["1","2","3","4","5","6","7","8","9"].map((d) => (
                <button
                  key={d}
                  onClick={() => handlePinDigit(d)}
                  disabled={loading}
                  className="flex h-16 items-center justify-center rounded-2xl border border-border/60 bg-card text-2xl font-semibold text-foreground transition-all active:scale-95 active:bg-muted hover:bg-accent disabled:opacity-50"
                >
                  {d}
                </button>
              ))}
              <button
                onClick={() => { setMode("choose"); setPin(""); setError(""); }}
                disabled={loading}
                className="flex h-16 items-center justify-center rounded-2xl text-xs text-muted-foreground transition-all active:scale-95 hover:bg-muted disabled:opacity-50"
              >
                Tillbaka
              </button>
              <button
                onClick={() => handlePinDigit("0")}
                disabled={loading}
                className="flex h-16 items-center justify-center rounded-2xl border border-border/60 bg-card text-2xl font-semibold text-foreground transition-all active:scale-95 active:bg-muted hover:bg-accent disabled:opacity-50"
              >
                0
              </button>
              <button
                onClick={handlePinDelete}
                disabled={loading || pin.length === 0}
                className="flex h-16 items-center justify-center rounded-2xl text-muted-foreground transition-all active:scale-95 hover:bg-muted disabled:opacity-30"
              >
                <Delete className="h-5 w-5" />
              </button>
            </div>

            {loading && (
              <div className="flex justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
