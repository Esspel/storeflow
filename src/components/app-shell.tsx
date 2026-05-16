import { Link, Outlet, useRouterState, useNavigate } from "@tanstack/react-router";
import { Bell, ChevronDown, ExternalLink, FlaskConical, LogOut, Menu, Settings, ShoppingCart, Trash2, User, X } from "lucide-react";
import { useEffect, useState } from "react";

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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth-context";
import { supabase, type Notification, cleanOldNotifications } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { getSimulatedDate, setTimeOffsetMs, isSimulationActive } from "@/lib/time-simulation";
import { supabase as _supabase } from "@/lib/supabase";

export function AppShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const { user, logout, userStores, activeStore, setActiveStore } = useAuth();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [mittCoopOpen, setMittCoopOpen] = useState(false);
  const [simActive, setSimActive] = useState(() => isSimulationActive());

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

  const nav = [
    { to: "/", label: "Översikt" },
    { to: "/uppgifter", label: "Uppgifter" },
    { to: "/schema", label: "Schema" },
    { to: "/avvikelser", label: "Avvikelser" },
    { to: "/kundrunda", label: "Kundrunda" },
    { to: "/moten", label: "Möten" },
    ...(isManager ? [{ to: "/rapporter", label: "Rapporter" }] : []),
    { to: "/mallar", label: "Mallar" },
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

  const handleLogout = async () => {
    await logout();
    navigate({ to: "/login" });
  };

  const initials = user?.display_name
    ? user.display_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  return (
    <div className="flex min-h-screen w-full flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-card">
        <div className="mx-auto flex h-16 w-full max-w-[1400px] items-center gap-4 px-5 md:px-8">
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

          <div className="ml-auto flex items-center gap-2">
            {/* Mitt Coop button — only when active store has SAP site ID */}
            {activeStore?.sap_site_id && (
              <Button
                variant="outline"
                size="sm"
                className="hidden rounded-full border-border/80 md:flex gap-1.5 text-xs"
                onClick={() => setMittCoopOpen(true)}
              >
                <ShoppingCart className="h-3.5 w-3.5" />
                Mitt Coop
              </Button>
            )}

            {/* Store switcher */}
            {userStores.length > 1 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="hidden rounded-full border-border/80 md:flex gap-1.5 max-w-[240px]">
                    <span className="truncate text-xs">{activeStore?.name ?? "Välj butik"}</span>
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  {userStores.map((s) => (
                    <DropdownMenuItem
                      key={s.id}
                      className={cn("cursor-pointer", activeStore?.id === s.id && "bg-primary-soft text-primary")}
                      onClick={() => setActiveStore(s)}
                    >
                      <span className="flex-1">{s.name}</span>
                      {activeStore?.id === s.id && <span className="ml-2 shrink-0 text-xs">Aktiv</span>}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
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
                            <p className={cn("text-sm font-medium", !n.is_read && "text-primary")}>{n.title}</p>
                            {n.body && <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>}
                            <p className="mt-1 text-xs text-muted-foreground/60">
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
              <DropdownMenuContent align="end" className="w-52">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium">{user?.display_name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
                  {activeStore && <p className="text-xs text-muted-foreground">{activeStore.name}</p>}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/installningar" className="cursor-pointer">
                    <Settings className="mr-2 h-4 w-4" />
                    Inställningar
                  </Link>
                </DropdownMenuItem>
                {isAdmin && (
                  <DropdownMenuItem asChild>
                    <Link to="/personal" className="cursor-pointer">
                      <User className="mr-2 h-4 w-4" />
                      Administration
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
                <DropdownMenuItem className="cursor-pointer text-destructive focus:text-destructive" onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Logga ut
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="outline" size="icon" className="rounded-xl border-border/80 md:hidden"
              onClick={() => setOpen((o) => !o)} aria-label="Meny"
            >
              {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {open && (
          <div className="border-t border-border/60 bg-card px-5 py-3 md:hidden">
            <nav className="flex flex-col">
              {nav.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className={cn("rounded-lg px-3 py-2.5 text-sm font-medium text-foreground/80", isActive(item.to) && "bg-primary-soft text-primary")}
                >
                  {item.label}
                </Link>
              ))}
              {userStores.length > 1 && (
                <>
                  <div className="my-2 border-t border-border/60" />
                  <p className="px-3 py-1 text-xs font-medium text-muted-foreground">Välj butik</p>
                  {userStores.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => { setActiveStore(s); setOpen(false); }}
                      className={cn("rounded-lg px-3 py-2.5 text-left text-sm text-foreground/80", activeStore?.id === s.id && "bg-primary-soft text-primary")}
                    >
                      {s.name}
                    </button>
                  ))}
                </>
              )}
            </nav>
          </div>
        )}
      </header>

      {simActive && (
        <div className="sticky top-16 z-30 flex items-center justify-between gap-3 border-b border-warning/40 bg-warning/10 px-5 py-2 text-xs font-medium text-warning-foreground md:px-8">
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

      <main className="flex-1 overflow-y-auto" data-scroll-container>
        <Outlet />
      </main>

      {/* Mitt Coop iframe panel */}
      <Sheet open={mittCoopOpen} onOpenChange={setMittCoopOpen}>
        <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-2xl">
          <SheetHeader className="flex flex-row items-center justify-between border-b border-border/60 px-4 py-3 space-y-0">
            <SheetTitle className="flex items-center gap-2 text-sm">
              <ShoppingCart className="h-4 w-4 text-primary" />
              Mitt Coop Sortiment
            </SheetTitle>
            <div className="flex items-center gap-2">
              <a
                href={`https://mittcoop.coop.se/sortiment/articles?siteId=${activeStore?.sap_site_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 rounded-full border border-border/60 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ExternalLink className="h-3 w-3" /> Öppna i ny flik
              </a>
              <button onClick={() => setMittCoopOpen(false)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
          </SheetHeader>
          <div className="relative flex-1">
            <p className="absolute inset-x-0 top-12 px-6 text-center text-xs text-muted-foreground">
              Logga in med Entra ID (Microsoft) i rutan nedan för att söka i sortimentet.
            </p>
            {activeStore?.sap_site_id && (
              <iframe
                src={`https://mittcoop.coop.se/sortiment/articles?siteId=${activeStore.sap_site_id}`}
                className="h-full w-full border-0"
                title="Mitt Coop Sortiment"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
