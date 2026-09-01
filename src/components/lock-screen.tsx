import React, { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, Delete, ScanBarcode, Search, X, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";
import { useBarcodeContext } from "@/lib/barcode-context";
import { supabase, type AppUser } from "@/lib/supabase";

const CameraScanner = React.lazy(() =>
  import("@/components/camera-scanner").then((m) => ({ default: m.CameraScanner })),
);

const QUICK_SWITCH_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quick-switch`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

type Props = {
  currentUser: AppUser;
  activeStoreId: string | null;
  onUnlock: (user: AppUser, token: string) => void;
  onCancel: () => void;
};

type SwitchMode = "choose" | "pin" | "barcode_waiting";

type QuickUser = {
  id: string;
  display_name: string;
  role: string;
  has_pin: boolean;
  has_barcode: boolean;
};

export function LockScreen({ currentUser, activeStoreId, onUnlock, onCancel }: Props) {
  const { setScanSuppressed } = useBarcodeContext();
  const [mode, setMode] = useState<SwitchMode>("choose");
  const [selectedUser, setSelectedUser] = useState<QuickUser | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [storeUsers, setStoreUsers] = useState<QuickUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [userSearch, setUserSearch] = useState("");
  // Scanner test state
  const [scannerTestActive, setScannerTestActive] = useState(false);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const scannerTestRef = useRef(scannerTestActive);
  scannerTestRef.current = scannerTestActive;

  // Hidden input that captures DataWedge / barcode scanner input regardless of focus state
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const hiddenInputLastKeyTime = useRef<number>(0);
  const submitSwitchRef = useRef<
    | ((
        opts: { mode: "pin"; userId: string; pin: string } | { mode: "barcode"; barcode: string },
      ) => void)
    | null
  >(null);

  // Keep the hidden input focused whenever the lock screen is visible and no modal/input has focus
  const refocusHiddenInput = useCallback(() => {
    const active = document.activeElement;
    if (
      active &&
      active !== document.body &&
      active !== hiddenInputRef.current &&
      (active.tagName === "INPUT" ||
        active.tagName === "TEXTAREA" ||
        (active as HTMLElement).isContentEditable)
    ) {
      return; // Don't steal focus from real inputs
    }
    hiddenInputRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    refocusHiddenInput();
    const interval = setInterval(refocusHiddenInput, 500);
    return () => clearInterval(interval);
  }, [refocusHiddenInput]);

  const handleHiddenInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    const now = Date.now();
    const gap = now - hiddenInputLastKeyTime.current;
    hiddenInputLastKeyTime.current = now;

    if (e.key === "Enter") {
      const val = hiddenInputRef.current?.value.trim() ?? "";
      if (hiddenInputRef.current) hiddenInputRef.current.value = "";
      if (val.length >= 4) {
        if (scannerTestRef.current) {
          setLastScanned(val);
        } else if (!loadingRef.current) {
          submitSwitchRef.current?.({ mode: "barcode", barcode: val });
        }
      }
      e.preventDefault();
      return;
    }

    // Suppress gap warning — accumulation still works via Enter
    void gap;
  }, []);

  // Take exclusive ownership of barcode events while the lock screen is mounted
  useEffect(() => {
    setScanSuppressed(true);
    return () => setScanSuppressed(false);
  }, [setScanSuppressed]);

  const pinRef = useRef(pin);
  pinRef.current = pin;

  useEffect(() => {
    // Avbryt direkt om vi saknar storeId eller användare
    if (!activeStoreId || !currentUser?.id) return;

    let isMounted = true;
    setLoadingUsers(true);

    supabase
      .from("user_stores")
      .select("user:app_users(id, display_name, role, quick_pin_hash, barcode_id)")
      .eq("store_id", activeStoreId)
      .then(({ data }) => {
        if (!isMounted) return; // Förhindra state-uppdatering om komponenten hinner avmonteras

        const users = (data ?? [])
          .map(
            (r: { user: unknown }) =>
              r.user as {
                id: string;
                display_name: string;
                role: string;
                quick_pin_hash: string | null;
                barcode_id: string | null;
              },
          )
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

    return () => {
      isMounted = false;
    };
  }, [activeStoreId, currentUser?.id]);

  const submitSwitch = useCallback(
    async (
      opts: { mode: "pin"; userId: string; pin: string } | { mode: "barcode"; barcode: string },
    ) => {
      if (!activeStoreId) return;
      setLoading(true);
      setError("");

      try {
        const body =
          opts.mode === "pin"
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
    },
    [activeStoreId, onUnlock],
  );
  submitSwitchRef.current = submitSwitch;

  const loadingRef = useRef(loading);
  loadingRef.current = loading;

  useBarcodeScanner({
    onScan: useCallback(
      (code: string) => {
        if (scannerTestRef.current) {
          setLastScanned(code);
          return;
        }
        if (loadingRef.current) return;
        submitSwitch({ mode: "barcode", barcode: code });
      },
      [submitSwitch],
    ),
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
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  const roleLabel: Record<string, string> = {
    admin: "Admin",
    manager: "Chef",
    employee: "Anställd",
  };

  const pinUsers = storeUsers.filter((u) => u.has_pin);
  const filteredPinUsers = userSearch.trim()
    ? pinUsers.filter((u) => u.display_name.toLowerCase().includes(userSearch.toLowerCase()))
    : pinUsers;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm">
      {/* Hidden barcode scanner input — always present so DataWedge can type into it */}
      <input
        ref={hiddenInputRef}
        aria-hidden="true"
        tabIndex={-1}
        inputMode="none"
        onKeyDown={handleHiddenInputKeyDown}
        onBlur={() => setTimeout(refocusHiddenInput, 50)}
        className="absolute opacity-0 pointer-events-none w-0 h-0 overflow-hidden"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
      />
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-5 py-4">
        <div className="flex flex-col">
          <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Store</span>
          <span className="text-xl font-black tracking-tight text-primary">Flow</span>
        </div>
        <button
          onClick={onCancel}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border/60 text-coop-gray-600 hover:text-coop-gray-900 transition-colors"
          aria-label="Avbryt"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="w-full max-w-sm px-6">
        {mode === "choose" && (
          <div className="space-y-5">
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-[13px] font-bold text-primary-foreground">
                  {initials(currentUser.display_name)}
                </div>
              </div>
              <p className="text-sm text-coop-gray-600">Inloggad som</p>
              <p className="font-semibold">{currentUser.display_name}</p>
              <p className="mt-4 text-base font-semibold">Vem tar över enheten?</p>
              <p className="mt-0.5 text-xs text-coop-gray-600">
                Scanna ditt kort eller välj ditt namn för PIN
              </p>
            </div>

            {/* Barcode scan options */}
            {!activeStoreId ? (
              <div className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-center">
                <p className="text-sm text-warning-foreground font-medium">Ingen butik vald</p>
                <p className="mt-0.5 text-xs text-coop-gray-600">
                  Välj en butik i toppmenyn för att kunna skanna
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Scanner test mode toggle */}
                {scannerTestActive ? (
                  <div className="rounded-xl border border-primary/40 bg-primary/5 px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4 text-primary" />
                        <p className="text-sm font-medium text-primary">Skannertestläge aktivt</p>
                      </div>
                      <button
                        onClick={() => {
                          setScannerTestActive(false);
                          setLastScanned(null);
                        }}
                        className="text-xs text-coop-gray-600 hover:text-coop-gray-900"
                      >
                        Avsluta test
                      </button>
                    </div>
                    <p className="text-xs text-coop-gray-600 mb-2">
                      Scanna en streckkod med Zebra-skannern för att testa att den fungerar.
                    </p>
                    {lastScanned ? (
                      <div className="flex items-center gap-2 rounded-lg bg-success/10 border border-success/30 px-3 py-2">
                        <Check className="h-4 w-4 text-success shrink-0" />
                        <div>
                          <p className="text-xs font-medium text-success">Skanning lyckades!</p>
                          <p className="text-[11px] text-coop-gray-600 font-mono break-all">
                            {lastScanned}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 rounded-lg bg-muted/50 border border-border/60 px-3 py-2">
                        <ScanBarcode className="h-4 w-4 text-coop-gray-600 shrink-0 animate-pulse" />
                        <p className="text-xs text-coop-gray-600">Väntar på skanning...</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-coop-gray-100 px-4 py-3">
                    <ScanBarcode className="h-5 w-5 shrink-0 text-primary" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">Scanna passerkort</p>
                      <p className="text-xs text-coop-gray-600">
                        Rikta Zebra-skannern mot streckkoden
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setScannerTestActive(true);
                        setLastScanned(null);
                      }}
                      className="text-[11px] text-coop-gray-600 hover:text-primary border border-border/60 rounded-full px-2 py-0.5 transition-colors shrink-0"
                    >
                      Testa
                    </button>
                  </div>
                )}
                <button
                  onClick={() => setCameraOpen(true)}
                  className="flex w-full items-center gap-3 rounded-xl border border-border/60 bg-coop-gray-100 px-4 py-3 transition-colors hover:bg-accent active:scale-[0.98]"
                >
                  <Camera className="h-5 w-5 shrink-0 text-primary" />
                  <div className="text-left">
                    <p className="text-sm font-medium">Scanna med kamera</p>
                    <p className="text-xs text-coop-gray-600">
                      Öppna kameran och scanna streckkod
                    </p>
                  </div>
                </button>
              </div>
            )}

            {/* User list for PIN */}
            {loadingUsers ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-14 animate-pulse rounded-xl bg-muted" />
                ))}
              </div>
            ) : pinUsers.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-coop-gray-600">
                  Logga in med PIN
                </p>
                {/* Search for users */}
                {pinUsers.length >= 5 && (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-coop-gray-600" />
                    <input
                      type="text"
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      placeholder="Sök person..."
                      className="w-full h-9 rounded-xl border border-border/60 bg-coop-gray-100 pl-9 pr-3 text-sm outline-none placeholder:text-coop-gray-600/50 focus:border-primary/50"
                    />
                    {userSearch && (
                      <button
                        onClick={() => setUserSearch("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2"
                      >
                        <X className="h-3.5 w-3.5 text-coop-gray-600" />
                      </button>
                    )}
                  </div>
                )}
                <div className="space-y-1.5 max-h-52 overflow-y-auto">
                  {filteredPinUsers.length === 0 ? (
                    <p className="py-3 text-center text-xs text-coop-gray-600">
                      Ingen person matchar sökningen.
                    </p>
                  ) : (
                    filteredPinUsers.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => {
                          setSelectedUser(u);
                          setMode("pin");
                          setPin("");
                          setError("");
                          setUserSearch("");
                        }}
                        className="flex w-full items-center gap-3 rounded-xl border border-border/60 bg-coop-gray-100 px-4 py-3 text-left transition-colors hover:bg-accent active:scale-[0.98]"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary">
                          {initials(u.display_name)}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{u.display_name}</p>
                          <p className="text-xs text-coop-gray-600">
                            {roleLabel[u.role] ?? u.role}
                          </p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <p className="text-center text-xs text-coop-gray-600">
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
              <p className="mt-0.5 text-sm text-coop-gray-600">Ange din 4-siffriga PIN</p>
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
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
                {error}
              </p>
            )}

            {/* PIN pad */}
            <div className="grid grid-cols-3 gap-3">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                <button
                  key={d}
                  onClick={() => handlePinDigit(d)}
                  disabled={loading}
                  className="flex h-16 items-center justify-center rounded-2xl border border-border/60 bg-coop-gray-100 text-2xl font-semibold text-coop-gray-900 transition-all active:scale-95 active:bg-muted hover:bg-accent disabled:opacity-50"
                >
                  {d}
                </button>
              ))}
              <button
                onClick={() => {
                  setMode("choose");
                  setPin("");
                  setError("");
                }}
                disabled={loading}
                className="flex h-16 items-center justify-center rounded-2xl text-xs text-coop-gray-600 transition-all active:scale-95 hover:bg-muted disabled:opacity-50"
              >
                Tillbaka
              </button>
              <button
                onClick={() => handlePinDigit("0")}
                disabled={loading}
                className="flex h-16 items-center justify-center rounded-2xl border border-border/60 bg-coop-gray-100 text-2xl font-semibold text-coop-gray-900 transition-all active:scale-95 active:bg-muted hover:bg-accent disabled:opacity-50"
              >
                0
              </button>
              <button
                onClick={handlePinDelete}
                disabled={loading || pin.length === 0}
                className="flex h-16 items-center justify-center rounded-2xl text-coop-gray-600 transition-all active:scale-95 hover:bg-muted disabled:opacity-30"
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

      {cameraOpen && (
        <React.Suspense fallback={null}>
          <CameraScanner
            onScan={(code) => {
              setCameraOpen(false);
              if (!loading) submitSwitch({ mode: "barcode", barcode: code });
            }}
            onClose={() => setCameraOpen(false)}
          />
        </React.Suspense>
      )}
    </div>
  );
}
