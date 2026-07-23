import { createFileRoute, Link } from "@tanstack/react-router";
import {
  TriangleAlert as AlertTriangle,
  ArrowRight,
  ChartBar as BarChart3,
  CalendarDays,
  ListChecks,
  UserRound,
  ShoppingCart,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/")({
  component: HubPage,
});

function HubPage() {
  const { user, activeStore } = useAuth();
  const isManager = user?.role === "manager" || user?.role === "admin";
  const firstName = user?.display_name?.split(" ")[0] ?? "";

  return (
    <div className="min-h-full" style={{ background: "oklch(0.94 0.04 145)" }}>
      <div className="mx-auto w-full max-w-[1400px] px-5 py-10 md:px-8 md:py-14">

        {/* Hero heading */}
        <div className="mb-8 md:mb-10">
          {firstName && (
            <p className="mb-1 text-base font-medium text-primary/80">Hej, {firstName}</p>
          )}
          <h1 className="text-3xl font-black tracking-tight text-foreground md:text-5xl">
            Vad ska du göra idag?
          </h1>
          {activeStore && (
            <p className="mt-2 text-sm text-muted-foreground">{activeStore.name}</p>
          )}
        </div>

        {/* Quick nav cards */}
        <div className={cn(
          "grid grid-cols-2 gap-3 sm:grid-cols-3",
          isManager ? "lg:grid-cols-6" : "lg:grid-cols-5"
        )}>
          <QuickCard to="/uppgifter" icon={ListChecks} title="Uppgifter" desc="Rutiner och checklistor" tone="blue" />
          <QuickCard to="/avvikelser" icon={AlertTriangle} title="Avvikelser" desc="Rapportera ärenden" tone="amber" />
          <QuickCard to="/schema" icon={CalendarDays} title="Schema" desc="Skiftöversikt" tone="green" />
          <QuickCard to="/kundrunda" icon={UserRound} title="Kundrunda" desc="Butikskontroll" tone="teal" />
          <QuickCard to="/kundonskemal" icon={ShoppingCart} title="Kundönskemål" desc="Produktförfrågningar" tone="rose" />
          {isManager && <QuickCard to="/rapporter" icon={BarChart3} title="Rapporter" desc="KPI:er och insikter" tone="green" />}
        </div>
      </div>
    </div>
  );
}

function QuickCard({ to, icon: Icon, title, desc, tone }: {
  to: string; icon: LucideIcon; title: string; desc: string; tone: "blue" | "amber" | "green" | "teal" | "slate" | "rose";
}) {
  const colors = {
    blue: "bg-info/10 text-info",
    amber: "bg-warning/15 text-warning-foreground",
    green: "bg-success/10 text-success",
    teal: "bg-teal-500/10 text-teal-600",
    slate: "bg-slate-500/10 text-slate-600",
    rose: "bg-rose-500/10 text-rose-600",
  };
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 rounded-2xl border border-border/60 bg-white p-3.5 shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] overflow-hidden"
    >
      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", colors[tone])}>
        <Icon className="h-4.5 w-4.5" />
      </div>
      <div className="min-w-0 flex-1 overflow-hidden">
        <p className="font-semibold text-sm text-foreground truncate leading-tight">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground truncate leading-tight">{desc}</p>
      </div>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}