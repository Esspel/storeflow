import { type ReactNode, useState, useEffect } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { LayoutDashboard, SquareCheck as CheckSquare, TriangleAlert as AlertTriangle, Users, Calendar, FileText, ChartBar as BarChart2, Settings, ClipboardList, MessageSquare, Bell, ChevronDown, Menu, X, Store, LogOut, ChevronRight } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { supabase, type Notification } from "@/lib/supabase";
import { toast } from "sonner";

const NAV_ITEMS = [
  { to: "/", label: "Pulstavlan", icon: LayoutDashboard },
  { to: "/uppgifter", label: "Uppgifter", icon: CheckSquare },
  { to: "/avvikelser", label: "Avvikelser", icon: AlertTriangle },
  { to: "/kundrunda", label: "Kundrunda", icon: ClipboardList },
  { to: "/moten", label: "Möten", icon: MessageSquare },
  { to: "/mallar", label: "Mallar", icon: FileText },
  { to: "/schema", label: "Schema", icon: Calendar },
  { to: "/rapporter", label: "Rapporter", icon: BarChart2 },
  { to: "/personal", label: "Personal", icon: Users },
  { to: "/installningar", label: "Inställningar", icon: Settings },
];

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { user, activeStore, stores, setActiveStore, logout } = useAuth();
  const isMobile = useIsMobile();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [storePickerOpen, setStorePickerOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    loadNotifications();

    const channel = supabase
      .channel(`notif-${user.id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        const n = payload.new as Notification;
        setNotifications(prev => [n, ...prev.slice(0, 19)]);
        setUnreadCount(c => c + 1);
        toast.info(n.title, { description: n.body });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  async function loadNotifications() {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (data) {
      setNotifications(data as Notification[]);
      setUnreadCount(data.filter((n: Notification) => !n.is_read).length);
    }
  }

  async function markAllRead() {
    if (!user) return;
    await supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
    setUnreadCount(0);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  }

  const currentNav = NAV_ITEMS.find(n => n.to === location.pathname || (n.to !== "/" && location.pathname.startsWith(n.to)));

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop Sidebar */}
      {!isMobile && (
        <aside className="w-60 shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col h-screen sticky top-0">
          <SidebarContent
            user={user}
            activeStore={activeStore}
            stores={stores}
            setActiveStore={setActiveStore}
            storePickerOpen={storePickerOpen}
            setStorePickerOpen={setStorePickerOpen}
            currentPath={location.pathname}
            logout={logout}
          />
        </aside>
      )}

      {/* Mobile Drawer */}
      {isMobile && sidebarOpen && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setSidebarOpen(false)} />
          <aside className="fixed inset-y-0 left-0 w-72 bg-sidebar border-r border-sidebar-border flex flex-col z-50 shadow-lg">
            <SidebarContent
              user={user}
              activeStore={activeStore}
              stores={stores}
              setActiveStore={setActiveStore}
              storePickerOpen={storePickerOpen}
              setStorePickerOpen={setStorePickerOpen}
              currentPath={location.pathname}
              logout={logout}
              onClose={() => setSidebarOpen(false)}
            />
          </aside>
        </>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-14 border-b border-border bg-card flex items-center px-4 gap-3 sticky top-0 z-30" data-safe-header>
          {isMobile && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg hover:bg-muted transition-colors"
              aria-label="Öppna meny"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}

          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold text-foreground truncate">
              {currentNav?.label ?? "StoreFlow"}
            </h1>
            {activeStore && (
              <p className="text-xs text-muted-foreground truncate">{activeStore.name}</p>
            )}
          </div>

          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => { setNotifOpen(!notifOpen); if (!notifOpen) markAllRead(); }}
              className="relative p-2 rounded-lg hover:bg-muted transition-colors"
              aria-label="Notifikationer"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 top-11 w-80 bg-card border border-border rounded-xl shadow-lg z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                  <span className="font-semibold text-sm">Notifikationer</span>
                  <button onClick={() => setNotifOpen(false)}>
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
                <div className="max-h-80 overflow-y-auto" data-scroll-container>
                  {notifications.length === 0 ? (
                    <p className="text-center text-muted-foreground text-sm py-6">Inga notifikationer</p>
                  ) : (
                    notifications.map(n => (
                      <div key={n.id} className={cn("px-4 py-3 border-b border-border last:border-0", !n.is_read && "bg-primary-soft")}>
                        <p className="text-sm font-medium">{n.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{n.body}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto" data-scroll-container>
          {children}
        </main>
      </div>
    </div>
  );
}

interface SidebarContentProps {
  user: ReturnType<typeof useAuth>["user"];
  activeStore: ReturnType<typeof useAuth>["activeStore"];
  stores: ReturnType<typeof useAuth>["stores"];
  setActiveStore: ReturnType<typeof useAuth>["setActiveStore"];
  storePickerOpen: boolean;
  setStorePickerOpen: (v: boolean) => void;
  currentPath: string;
  logout: () => void;
  onClose?: () => void;
}

function SidebarContent({ user, activeStore, stores, setActiveStore, storePickerOpen, setStorePickerOpen, currentPath, logout, onClose }: SidebarContentProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="h-14 flex items-center gap-3 px-4 border-b border-sidebar-border">
        <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
          <Store className="w-4 h-4 text-primary-foreground" />
        </div>
        <span className="font-bold text-sidebar-foreground text-base tracking-tight">StoreFlow</span>
        {onClose && (
          <button onClick={onClose} className="ml-auto p-1 hover:bg-sidebar-accent rounded-lg">
            <X className="w-4 h-4 text-sidebar-foreground" />
          </button>
        )}
      </div>

      {/* Store picker */}
      {stores.length > 1 && (
        <div className="px-3 py-2 border-b border-sidebar-border">
          <button
            onClick={() => setStorePickerOpen(!storePickerOpen)}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-sidebar-accent transition-colors text-left"
          >
            <Store className="w-4 h-4 text-sidebar-primary shrink-0" />
            <span className="text-xs font-medium text-sidebar-foreground truncate flex-1">
              {activeStore?.name ?? "Välj butik"}
            </span>
            <ChevronDown className={cn("w-3 h-3 text-muted-foreground transition-transform", storePickerOpen && "rotate-180")} />
          </button>
          {storePickerOpen && (
            <div className="mt-1 space-y-0.5">
              {stores.map(s => (
                <button
                  key={s.id}
                  onClick={() => { setActiveStore(s); setStorePickerOpen(false); if (onClose) onClose(); }}
                  className={cn(
                    "w-full text-left px-3 py-1.5 rounded-lg text-xs transition-colors",
                    activeStore?.id === s.id
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "hover:bg-sidebar-accent text-sidebar-foreground"
                  )}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5" data-scroll-container>
        {NAV_ITEMS.map(item => {
          const active = item.to === "/" ? currentPath === "/" : currentPath.startsWith(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium shadow-sm"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
              {active && <ChevronRight className="w-3.5 h-3.5 ml-auto opacity-70" />}
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="px-3 py-3 border-t border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-primary-foreground shrink-0">
            {user?.display_name?.[0]?.toUpperCase() ?? "U"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-sidebar-foreground truncate">{user?.display_name}</p>
            <p className="text-[10px] text-muted-foreground truncate capitalize">{user?.role}</p>
          </div>
          <button
            onClick={logout}
            className="p-1.5 rounded-lg hover:bg-sidebar-accent transition-colors"
            aria-label="Logga ut"
          >
            <LogOut className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>
    </div>
  );
}
