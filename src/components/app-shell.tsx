import { Link, Outlet, useRouterState, useNavigate } from "@tanstack/react-router";
import { ErrorBoundary } from "@/components/error-boundary";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { ChartBar as BarChart3, Bell, ClipboardList, FileText, FlaskConical, Hop as Home, Circle as HelpCircle, LogOut, MoveHorizontal as MoreHorizontal, Settings, ShoppingCart, TriangleAlert, CalendarDays, UserRound, Trash2, User, Wifi, WifiOff, ArrowLeftRight, Store, X as XIcon, Tv as Tv2, ChartBar as BarChart2 } from "lucide-react";
import { ROLE_LABELS, HIERARCHY_LABELS } from "@/lib/supabase";
import { LockScreen } from "@/components/lock-screen";
import { GlobalStoreSelector } from "@/components/global-store-selector";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAuth } from "@/lib/auth-context";
import { supabase, type Notification, cleanOldNotifications } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { getSimulatedDate, setTimeOffsetMs, isSimulationActive } from "@/lib/time-simulation";
import { supabase as _supabase } from "@/lib/supabase";

// ── SW update banner ────────────────────────────────────────────────────────
function SwUpdateBanner() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const reg = navigator.serviceWorker.getRegistration();
    reg.then((r) => {
      if (!r) return;

      const attachWaiting = (sw: ServiceWorker) => {
        if (sw.state === "installed") setWaiting(sw);
        sw.addEventListener("statechange", () => {
          if (sw.state === "installed") setWaiting(sw);
        });
      };

      if (r.waiting) { attachWaiting(r.waiting); return; }

      r.addEventListener("updatefound", () => {
        const newSw = r.installing;
        if (newSw) attachWaiting(newSw);
      });

      // Poll for updates every 60s so Zebra devices with long sessions catch deploys
      const poll = setInterval(() => r.update(), 60_000);
      return () => clearInterval(poll);
    });
  }, []);

  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timer);
          applyUpdate(waiting);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [waiting]);

  function applyUpdate(sw: ServiceWorker) {
    sw.postMessage({ type: "SKIP_WAITING" });
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      window.location.reload();
    }, { once: true });
  }

  if (!waiting) return null;

  return (
    <div
      role="alert"
      className="sticky top-0 z-[60] flex items-center justify-between gap-3 border-b-2 border-amber-400 bg-amber-400 px-4 py-3 text-sm font-semibold text-amber-950"
    >
      <span>
        En ny säkerhetsuppdatering är tillgänglig. Appen startas om automatiskt om{" "}
        <strong>{countdown}</strong> sekund{countdown !== 1 ? "er" : ""}...
      </span>
      <button
        onClick={() => applyUpdate(waiting)}
        className="shrink-0 rounded-full bg-amber-950 px-3 py-1 text-xs font-bold text-amber-50 transition-opacity hover:opacity-80 active:opacity-70"
      >
        Starta om nu
      </button>
    </div>
  );
}

// ── Offline snackbar ────────────────────────────────────────────────────────
function OfflineSnackbar() {
  // "idle" = never been offline, snackbar never shows
  const [status, setStatus] = useState<"idle" | "offline" | "reconnected">(
    typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "idle",
  );
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track whether we have ever gone offline this session
  const wentOfflineRef = useRef(typeof navigator !== "undefined" && !navigator.onLine);

  useEffect(() => {
    const onOffline = () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      wentOfflineRef.current = true;
      setStatus("offline");
    };
    const onOnline = () => {
      // Only show "reconnected" if we actually went offline first
      if (!wentOfflineRef.current) return;
      setStatus("reconnected");
      hideTimerRef.current = setTimeout(() => setStatus("idle"), 2000);
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  if (status === "idle") return null;

  return (
    <div
      id="offline-snackbar"
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium shadow-lg",
        status === "offline"
          ? "bg-destructive text-destructive-foreground"
          : "bg-success text-success-foreground",
        "visible",
      )}
    >
      {status === "offline" ? (
        <>
          <WifiOff className="h-4 w-4 shrink-0" />
          Du är offline – ändringar sparas lokalt
        </>
      ) : (
        <>
          <Wifi className="h-4 w-4 shrink-0" />
          Ansluten
        </>
      )}
    </div>
  );
}

export function AppShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, logout, userStores, activeStore, setActiveStore, lockScreenOpen, openLockScreen, closeLockScreen, quickSwitch } = useAuth();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [simActive, setSimActive] = useState(() => isSimulationActive());
  const [moreOpen, setMoreOpen] = useState(false);

  // Push subscription maintenance: ensure registration is valid on every session
  useEffect(() => {
    if (!user) return;
    const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
    if (!vapidKey || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (Notification.permission !== "granted") return;

    const maintain = async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!sub) return;

        const isDeprecated = sub.endpoint.includes("fcm.googleapis.com/fcm/send/");
        if (isDeprecated) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
          await sub.unsubscribe();
          // Re-subscribe with fresh endpoint
          const padding = "=".repeat((4 - (vapidKey.length % 4)) % 4);
          const base64 = (vapidKey + padding).replace(/-/g, "+").replace(/_/g, "/");
          const rawData = atob(base64);
          const appServerKey = Uint8Array.from(rawData, (c) => c.charCodeAt(0));
          const freshSub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appServerKey });
          await supabase.from("push_subscriptions").insert({
            user_id: user.id,
            endpoint: freshSub.endpoint,
            subscription_json: freshSub.toJSON(),
            user_agent: navigator.userAgent,
          });
          return;
        }

        // Ensure subscription exists in DB for this user
        const { data: existing } = await supabase
          .from("push_subscriptions")
          .select("id")
          .eq("user_id", user.id)
          .eq("endpoint", sub.endpoint)
          .maybeSingle();

        if (!existing) {
          await supabase.from("push_subscriptions").upsert(
            { user_id: user.id, endpoint: sub.endpoint, subscription_json: sub.toJSON(), user_agent: navigator.userAgent, updated_at: new Date().toISOString() },
            { onConflict: "endpoint" },
          );
        }
      } catch (err) {
        console.error("Push maintenance error:", err);
      }
    };

    maintain();
  }, [user]);

  useEffect(() => {
    const sync = () => setSimActive(isSimulationActive());
    window.addEventListener("sf-time-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("sf-time-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const isAdmin = user?.role === "admin";
  const isManager = user?.role === "manager" || isAdmin;
  const isAboveStore = isAdmin || user?.hierarchy_level === "hk" || user?.hierarchy_level === "forening" || user?.hierarchy_level === "distrikt";

  const nav = [
    { to: "/", label: "Översikt", mobileHidden: false, Icon: Home },
    { to: "/uppgifter", label: "Uppgifter", mobileHidden: false, Icon: ClipboardList },
    { to: "/schema", label: "Schema", mobileHidden: false, Icon: CalendarDays },
    { to: "/avvikelser", label: "Avvikelser", mobileHidden: true, Icon: TriangleAlert },
    { to: "/kundrunda", label: "Kundrunda", mobileHidden: true, Icon: UserRound },
    { to: "/kundonskemal", label: "Kundönskemål", mobileHidden: true, Icon: ShoppingCart },
    ...(isManager ? [{ to: "/rapporter", label: "Rapporter", mobileHidden: true, Icon: FlaskConical }] : []),
    { to: "/mallar", label: "Mallar", mobileHidden: true, Icon: ClipboardList },
  ];


  useEffect(() => {
    if (!user) return;

    const fetchNotifications = () => {
      supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20)
        .then(({ data }) => { if (data) setNotifications(data as Notification[]); });
    };

    fetchNotifications();
    cleanOldNotifications(user.id);
    const interval = setInterval(fetchNotifications, 5000);
    const onVisible = () => { if (document.visibilityState === "visible") fetchNotifications(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const markAllRead = async () => {
    if (!user || unreadCount === 0) return;
    await supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const deleteNotification = async (id: string) => {
    await supabase.from("notifications").delete().eq("id", id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const isActive = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));

  // Routes grouped under "Övrigt" in mobile bottom nav
  const moreRoutes = [
    { to: "/avvikelser", label: "Avvikelser", Icon: TriangleAlert },
    { to: "/kundrunda", label: "Kundrunda", Icon: UserRound },
    { to: "/kundonskemal", label: "Kundönskemål", Icon: ShoppingCart },
    ...(isManager ? [{ to: "/rapporter", label: "Rapporter", Icon: FlaskConical }] : []),
    { to: "/mallar", label: "Mallar", Icon: ClipboardList },
    { to: "/hjalp", label: "Hjälp", Icon: HelpCircle },
  ];
  const isMoreActive = moreRoutes.some(r => isActive(r.to));

  const handleLogout = async () => {
    await logout();
    navigate({ to: "/login" });
  };

  const initials = user?.display_name
    ? user.display_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  return (
    <div className="flex min-h-screen w-full flex-col bg-background" style={{ isolation: "isolate" }}>
      <SwUpdateBanner />
      <div className="pt-safe" />

      <header className="sticky top-0 z-40 border-b border-border/60 bg-card">
        <div className="mx-auto flex h-14 w-full max-w-[1400px] items-center gap-3 px-4 md:h-16 md:gap-4 md:px-8">
          <Link to="/" className="flex shrink-0 items-center gap-2">
            <div className="flex flex-col leading-none">
              <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Store</span>
              <span className="text-2xl font-black tracking-tight text-primary">Flow</span>
            </div>
          </Link>

          <nav className="hidden flex-1 items-center gap-1 md:flex">
            {nav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "relative rounded-full px-3.5 py-2 text-sm font-medium text-foreground/70 transition-colors hover:text-primary",
                  isActive(item.to) && "text-primary",
                )}
              >
                {item.label}
                {isActive(item.to) && (
                  <span className="absolute inset-x-3.5 -bottom-[14px] h-[3px] rounded-t-full bg-primary" />
                )}
              </Link>
            ))}
          </nav>
          {/* Mobile bottom nav — core routes only */}
          <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t border-border/60 bg-card pb-safe md:hidden" data-safe-bottom>
            {nav.filter((item) => !item.mobileHidden).map(({ to, label, Icon }) => (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
                  isActive(to) ? "text-primary" : "text-muted-foreground",
                )}
              >
                <div className={cn(
                  "flex h-7 w-10 items-center justify-center rounded-full transition-all",
                  isActive(to) ? "bg-primary/10" : "bg-transparent",
                )}>
                  <Icon className="h-4 w-4" />
                </div>
                <span className="leading-none">{label}</span>
              </Link>
            ))}
            {/* Övrigt — collapses avvikelser, kundrunda, möten, kundönskemål */}
            <button
              onClick={() => setMoreOpen(true)}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
                isMoreActive ? "text-primary" : "text-muted-foreground",
              )}
            >
              <div className={cn(
                "flex h-7 w-10 items-center justify-center rounded-full transition-all",
                isMoreActive ? "bg-primary/10" : "bg-transparent",
              )}>
                <MoreHorizontal className="h-4 w-4" />
              </div>
              <span className="leading-none">Övrigt</span>
            </button>
          </nav>


          <div className="ml-auto flex items-center gap-1.5 md:gap-2">
            {/* Global store selector — all users with multiple stores */}
            <GlobalStoreSelector />

            {/* SAP product catalog button */}
            {activeStore?.sap_site_id && (
              <a
                href={`https://mittcoop.coop.se/sortiment/articles?siteId=${activeStore.sap_site_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-background px-3 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:bg-accent hover:text-accent-foreground active:opacity-75"
              >
                <ShoppingCart className="h-3.5 w-3.5" />
                <span className="sm:hidden">Sortiment</span>
                <span className="hidden sm:inline">Mitt Coop-sortiment</span>
              </a>
            )}


            {/* Notifications */}
            <Popover open={notifOpen} onOpenChange={setNotifOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="icon" className="relative rounded-xl border-border/80" aria-label="Notiser">
                  <Bell className="h-4 w-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-0">
                <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
                  <p className="text-sm font-semibold">Notiser</p>
                  {unreadCount > 0 && (
                    <button onClick={markAllRead} className="text-xs text-primary hover:underline">
                      Markera alla som lästa
                    </button>
                  )}
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <p className="px-4 py-8 text-center text-sm text-muted-foreground">Inga notiser</p>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        className={cn("group border-b border-border/40 px-4 py-3 last:border-0", !n.is_read && "bg-primary-soft/30")}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className={cn("text-sm font-medium leading-snug", !n.is_read && "text-primary")}>{n.title}</p>
                            {n.body && <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{n.body}</p>}
                            <p className="mt-1 text-xs text-muted-foreground/70">
                              {new Date(n.created_at).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" })}
                            </p>
                          </div>
                          <button
                            onClick={() => deleteNotification(n.id)}
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground/40 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 active:opacity-100"
                            aria-label="Ta bort notis"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </PopoverContent>
            </Popover>

            {/* User menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="rounded-xl border-border/80" aria-label="Konto">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-soft text-[10px] font-bold text-primary">
                    {initials}
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium">{user?.display_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {user?.hierarchy_level
                      ? (HIERARCHY_LABELS[user.hierarchy_level] ?? ROLE_LABELS[user.role] ?? user.role)
                      : (user?.role ? (ROLE_LABELS[user.role] ?? user.role) : "")}
                  </p>
                  {activeStore && (
                    <p className="text-xs text-muted-foreground">{activeStore.name}</p>
                  )}
                </div>
                {/* Store switcher in dropdown — mobile only */}
                <div className="md:hidden">
                  <DropdownMenuSeparator />
                  <GlobalStoreSelector inline />
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild className="md:hidden">
                  <Link to="/mallar" className="cursor-pointer">
                    <FileText className="mr-2 h-4 w-4" />
                    Mallar
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="md:hidden">
                  <Link to="/rapporter" className="cursor-pointer">
                    <BarChart3 className="mr-2 h-4 w-4" />
                    Rapporter
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="md:hidden" />
                <DropdownMenuItem asChild>
                  <Link to="/butiksregister" className="cursor-pointer">
                    <Store className="mr-2 h-4 w-4" />
                    Butiksregister
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/installningar" className="cursor-pointer">
                    <Settings className="mr-2 h-4 w-4" />
                    Inställningar
                  </Link>
                </DropdownMenuItem>
                {isManager && (
                  <DropdownMenuItem asChild>
                    <Link to="/personal" className="cursor-pointer">
                      <User className="mr-2 h-4 w-4" />
                      Administration
                    </Link>
                  </DropdownMenuItem>
                )}
                {(isAdmin || user?.hierarchy_level === "hk" || user?.hierarchy_level === "forening" || user?.hierarchy_level === "distrikt") && (
                  <DropdownMenuItem asChild>
                    <Link to="/hk-dashboard" className="cursor-pointer">
                      <BarChart3 className="mr-2 h-4 w-4" />
                      Dashboard
                    </Link>
                  </DropdownMenuItem>
                )}
                {isAdmin && (
                  <DropdownMenuItem asChild>
                    <Link to="/testpanel" className="cursor-pointer">
                      <FlaskConical className="mr-2 h-4 w-4" />
                      Testpanel
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/hjalp" className="cursor-pointer">
                    <HelpCircle className="mr-2 h-4 w-4" />
                    Hjälp & Manual
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer" onClick={openLockScreen}>
                  <ArrowLeftRight className="mr-2 h-4 w-4" />
                  Växla användare
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer text-destructive focus:text-destructive" onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Logga ut
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

          </div>
        </div>
      </header>

      {simActive && (
        <div className="sticky top-14 z-30 flex items-center justify-between gap-3 border-b border-warning/40 bg-warning/10 px-5 py-2 text-xs font-medium text-warning-foreground md:top-16 md:px-8">
          <span>
            Tidssimulering aktiv — simulerad tid:{" "}
            <strong>{getSimulatedDate().toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" })}</strong>
          </span>
          <button
            className="rounded-full border border-warning/40 px-3 py-1 hover:bg-warning/20 transition-colors"
            onClick={async () => {
              await _supabase.from("tasks").delete().not("parent_task_id", "is", null);
              setTimeOffsetMs(0);
              setSimActive(false);
            }}
          >
            Återställ
          </button>
        </div>
      )}

      <main className="flex-1 pb-24 md:pb-0">
        <ErrorBoundary section="Sida" storeId={activeStore?.id ?? null}>
          <Outlet />
        </ErrorBoundary>
      </main>

      <div className="pb-safe" />

      {/* Global offline / reconnected snackbar */}
      <OfflineSnackbar />

      {/* Global keyboard shortcuts (desktop only) */}
      <KeyboardShortcuts />

      {/* Lock screen / quick user switch */}
      {lockScreenOpen && user && (
        <LockScreen
          currentUser={user}
          activeStoreId={activeStore?.id ?? null}
          onUnlock={quickSwitch}
          onCancel={closeLockScreen}
        />
      )}

      {/* Övrigt sheet — rendered outside header to avoid stacking context issues */}
      {moreOpen && (
        <div className="fixed inset-0 z-[250] md:hidden" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="absolute bottom-0 left-0 right-0 rounded-t-3xl border-t border-border/60 bg-card pb-safe shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <span className="text-sm font-semibold text-foreground">Övrigt</span>
              <button onClick={() => setMoreOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <XIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 px-4 pb-6 pt-2">
              {moreRoutes.map(({ to, label, Icon }) => (
                <Link
                  key={to}
                  to={to}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-2xl border border-border/60 px-3 py-4 transition-colors",
                    isActive(to) ? "bg-primary/10 border-primary/30 text-primary" : "bg-muted/30 text-foreground hover:bg-muted/60",
                  )}
                >
                  <Icon className="h-6 w-6" />
                  <span className="text-[11px] font-medium text-center leading-tight">{label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
