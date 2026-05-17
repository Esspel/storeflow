import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, ListChecks, TriangleAlert as AlertTriangle, MessageSquare, ClipboardCheck, ChartBar as BarChart3, Monitor, Users, Store, Settings, Sparkles, CalendarDays } from "lucide-react";

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

const main = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Uppgifter", url: "/uppgifter", icon: ListChecks },
  { title: "Schema", url: "/schema", icon: CalendarDays },
  { title: "Avvikelser", url: "/avvikelser", icon: AlertTriangle },
  { title: "Kommunikation", url: "/kommunikation", icon: MessageSquare },
];

const operations = [
  { title: "Butiker", url: "/butiker", icon: Store },
  { title: "Revisioner", url: "/revisioner", icon: ClipboardCheck },
  { title: "Styrtavlor", url: "/styrtavlor", icon: Monitor },
  { title: "Rapporter", url: "/rapporter", icon: BarChart3 },
];

const admin = [
  { title: "Personal & Roller", url: "/personal", icon: Users },
  { title: "Inställningar", url: "/installningar", icon: Settings },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (path: string) =>
    path === "/" ? pathname === "/" : pathname.startsWith(path);

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
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-accent-foreground">
            EA
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-medium">Emma Andersson</span>
            <span className="text-[11px] text-muted-foreground">Regionchef · Syd</span>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
