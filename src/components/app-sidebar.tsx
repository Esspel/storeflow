import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, ListChecks, TriangleAlert as AlertTriangle, MessageSquare, ClipboardCheck, ChartBar as BarChart3, Monitor, Users, Store, Settings, Sparkles, CalendarDays, ChartBar as BarChart2, ShoppingCart, FileText, Link as LinkIcon } from "lucide-react";

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

const main = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Uppgifter", url: "/uppgifter", icon: ListChecks },
  { title: "Schema", url: "/schema", icon: CalendarDays },
  { title: "Avvikelser", url: "/avvikelser", icon: AlertTriangle },
  { title: "Kundönskemål", url: "/kundonskemal", icon: ShoppingCart },
  { title: "Kommunikation", url: "/kommunikation", icon: MessageSquare },
];

const operations = [
  { title: "Butiker", url: "/butiker", icon: Store },
  { title: "Revisioner", url: "/revisioner", icon: ClipboardCheck },
  { title: "Styrtavlor", url: "/styrtavlor", icon: Monitor },
  { title: "Mallar", url: "/mallar", icon: FileText },
  { title: "Länkregister", url: "/lankregister", icon: LinkIcon },
  { title: "Rapporter", url: "/rapporter", icon: BarChart3 },
];

const admin = [
  { title: "Personal & Roller", url: "/personal", icon: Users },
  { title: "Inställningar", url: "/installningar", icon: Settings },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user } = useAuth();
  const isActive = (path: string) =>
    path === "/" ? pathname === "/" : pathname.startsWith(path);

  const hierarchyLevel = user?.hierarchy_level;
  const showHkDashboard =
    user?.role === "admin" ||
    hierarchyLevel === "hk" ||
    hierarchyLevel === "forening" ||
    hierarchyLevel === "distrikt";

  const renderItem = (item: { title: string; url: string; icon: typeof Store }) => (
    <SidebarMenuItem key={item.url}>
      <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
        <Link to={item.url} className="gap-3">
          <item.icon className="h-4 w-4" />
          <span>{item.title}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  const displayName = user?.display_name ?? "–";
  const initials = displayName.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  const roleLabel = hierarchyLevel === "hk" ? "Huvudkontor"
    : hierarchyLevel === "forening" ? "Förening"
    : hierarchyLevel === "distrikt" ? "Distrikt"
    : hierarchyLevel === "chef" ? "Butikschef"
    : user?.role === "admin" ? "Admin"
    : "Medarbetare";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link to="/" className="flex items-center gap-2 px-2 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-md)]">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold tracking-tight">StoreFlow</span>
            <span className="text-[11px] text-muted-foreground">Retail Operations</span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Drift</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{main.map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {showHkDashboard && (
          <SidebarGroup>
            <SidebarGroupLabel>Styrning</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/hk-dashboard")} tooltip="Dashboard">
                    <Link to="/hk-dashboard" className="gap-3">
                      <BarChart2 className="h-4 w-4" />
                      <span>Dashboard</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <SidebarGroup>
          <SidebarGroupLabel>Operations</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{operations.map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Administration</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{admin.map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center gap-3 rounded-lg p-2 group-data-[collapsible=icon]:hidden">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-accent-foreground">
            {initials}
          </div>
          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-sm font-medium truncate">{displayName}</span>
            <span className="text-[11px] text-muted-foreground">{roleLabel}</span>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
