import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  ListChecks,
  TriangleAlert,
  MessageSquare,
  ClipboardCheck,
  Monitor,
  Users,
  Store,
  Settings,
  Sparkles,
  CalendarDays,
  ChartBar,
  ShoppingCart,
  FileText,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth-context";

interface MenuItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
}

const mainRoutes: MenuItem[] = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Uppgifter", url: "/uppgifter", icon: ListChecks },
  { title: "Schema", url: "/schema", icon: CalendarDays },
  { title: "Avvikelser", url: "/avvikelser", icon: TriangleAlert },
  { title: "Kundönskemål", url: "/kundonskemal", icon: ShoppingCart },
  { title: "Kommunikation", url: "/kommunikation", icon: MessageSquare },
];

const operationsRoutes: MenuItem[] = [
  { title: "Butiker", url: "/butiker", icon: Store },
  { title: "Revisioner", url: "/revisioner", icon: ClipboardCheck },
  { title: "Styrtavlor", url: "/styrtavlor", icon: Monitor },
  { title: "Mallar", url: "/mallar", icon: FileText },
  { title: "Rapporter", url: "/rapporter", icon: ChartBar },
];

const adminRoutes: MenuItem[] = [
  { title: "Personal & Roller", url: "/personal", icon: Users },
  { title: "Inställningar", url: "/installningar", icon: Settings },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user } = useAuth();

  const isActive = (path: string) => (path === "/" ? pathname === "/" : pathname.startsWith(path));

  const hierarchyLevel = user?.hierarchy_level;
  const isAdmin = user?.role === "admin";
  const isManager = user?.role === "manager" || isAdmin;

  const renderItem = (item: MenuItem) => (
    <SidebarMenuItem key={item.url}>
      <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
        <Link to={item.url} className="gap-3">
          <item.icon className="h-4 w-4 shrink-0" />
          <span>{item.title}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  const displayName = user?.display_name?.trim() || "Användare";
  const initials =
    displayName
      .split(" ")
      .filter(Boolean)
      .filter((p) => p && p.length > 0)
      .map((p) => p[0])
      .filter((char): char is string => typeof char === "string" && char.length > 0)
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";

  const roleLabel =
    hierarchyLevel === "hk"
      ? "Huvudkontor"
      : hierarchyLevel === "forening"
        ? "Förening"
        : hierarchyLevel === "distrikt"
          ? "Distrikt"
          : hierarchyLevel === "chef"
            ? "Butikschef"
            : isAdmin
              ? "Admin"
              : "Medarbetare";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link to="/" className="flex items-center gap-2 px-2 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold tracking-tight">StoreFlow</span>
            <span className="text-[11px] text-muted-foreground">Retail Operations</span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {/* Hauptsektion / Drift */}
        <SidebarGroup>
          <SidebarGroupLabel>Drift</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{mainRoutes.map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Operations */}
        <SidebarGroup>
          <SidebarGroupLabel>Operations</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{operationsRoutes.map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Administration (Begränsad baserat på roll om så önskas) */}
        <SidebarGroup>
          <SidebarGroupLabel>Administration</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {adminRoutes
                .filter((item) => (item.url === "/personal" ? isManager : true))
                .map(renderItem)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Sidofotsdel för inloggad användare */}
      <SidebarFooter>
        <div className="flex items-center gap-3 rounded-lg p-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
            title={displayName}
          >
            {initials}
          </div>
          <div className="flex flex-col leading-tight min-w-0 group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-medium truncate">{displayName}</span>
            <span className="text-[11px] text-muted-foreground">{roleLabel}</span>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
