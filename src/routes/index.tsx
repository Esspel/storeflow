import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  TriangleAlert as AlertTriangle,
  ArrowRight,
  ChartBar as BarChart3,
  CalendarDays,
  ListChecks,
  UserRound,
  ShoppingCart,
  RefreshCw,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { ErrorBoundary } from "@/components/error-boundary";
import { getKundrundaAssignmentsThisWeek } from "@/lib/supabase";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: HubPage,
});

function HubPage() {
  const { user, activeStore } = useAuth();
  const isManager = user?.role === "manager" || user?.role === "admin";
  const firstName = user?.display_name?.split(" ")[0] ?? "";

  // Hämta min tilldelade kundrunda denna vecka
  const [myKundrunda, setMyKundrunda] = useState<{ day: string } | null>(null);
  useEffect(() => {
    if (!activeStore?.id || !user?.id) return;
    getKundrundaAssignmentsThisWeek(activeStore.id, user.id)
      .then((a) => {
        if (a.length > 0) {
          const days = ["Söndag", "Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag"];
          setMyKundrunda({ day: days[a[0].day_of_week] });
        }
      })
      .catch(() => {});
  }, [activeStore?.id, user?.id]);

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
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {activeStore.name}
            </p>
          )}
        </div>

        {/* Min kundrunda-snabblänk (endast om tilldelad) */}
        {myKundrunda && (
          <a
            href="/kundrunda"
            className="mb-4 flex items-center gap-2 rounded-2xl border border-primary/30 bg-primary-soft p-4 sm:col-span-3"
          >
            <UserRound className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium text-primary">
              Din kundrunda: {myKundrunda.day}
            </span>
          </a>
        )}

        {/* Quick nav cards */}
        <div
          className={cn(
            "grid grid-cols-2 gap-3 sm:grid-cols-3",
            isManager ? "lg:grid-cols-6" : "lg:grid-cols-5",
          )}
        >
          <ErrorBoundary section="Uppgifter" fallback={<WidgetFallback name="Uppgifter" />}>
            <QuickCard
              to="/uppgifter"
              icon={ListChecks}
              title="Uppgifter"
              desc="Rutiner och checklistor"
              tone="blue"
            />
          </ErrorBoundary>
          <ErrorBoundary section="Avvikelser" fallback={<WidgetFallback name="Avvikelser" />}>
            <QuickCard
              to="/avvikelser"
              icon={AlertTriangle}
              title="Avvikelser"
              desc="Rapportera ärenden"
              tone="amber"
            />
          </ErrorBoundary>
          <ErrorBoundary section="Schema" fallback={<WidgetFallback name="Schema" />}>
            <QuickCard
              to="/schema"
              icon={CalendarDays}
              title="Schema"
              desc="Skiftöversikt"
              tone="green"
            />
          </ErrorBoundary>
          <ErrorBoundary section="Kundrunda" fallback={<WidgetFallback name="Kundrunda" />}>
            <QuickCard
              to="/kundrunda"
              icon={UserRound}
              title="Kundrunda"
              desc="Butikskontroll"
              tone="teal"
            />
          </ErrorBoundary>
          <ErrorBoundary section="Kundönskemål" fallback={<WidgetFallback name="Kundönskemål" />}>
            <QuickCard
              to="/kundonskemal"
              icon={ShoppingCart}
              title="Kundönskemål"
              desc="Produktförfrågningar"
              tone="rose"
            />
          </ErrorBoundary>
          {isManager && (
            <>
              <ErrorBoundary section="Rapporter" fallback={<WidgetFallback name="Rapporter" />}>
                <QuickCard
                  to="/rapporter"
                  icon={BarChart3}
                  title="Rapporter"
                  desc="KPI:er och insikter"
                  tone="green"
                />
              </ErrorBoundary>
              <ErrorBoundary
                section="Butiksinstallation"
                fallback={<WidgetFallback name="Butiksinstallation" />}
              >
                <QuickCard
                  to="/shelf-analytics"
                  icon={BarChart3}
                  title="Hyllanalys"
                  desc="Planogram- och hyllkontrolle"
                  tone="indigo"
                />
              </ErrorBoundary>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function WidgetFallback({ name }: { name: string }) {
  return (
    <div
      role="alert"
      className="col-span-2 flex flex-col items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-center sm:col-span-3"
    >
      <span className="text-sm text-destructive">Kunde inte ladda {name}</span>
      <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
        Försök igen
      </Button>
    </div>
  );
}

function QuickCard({
  to,
  icon: Icon,
  title,
  desc,
  tone,
}: {
  to: string;
  icon: LucideIcon;
  title: string;
  desc: string;
  tone: "blue" | "amber" | "green" | "teal" | "slate" | "rose" | "indigo";
}) {
  const colors = {
    blue: "bg-info/10 text-info",
    amber: "bg-warning/15 text-warning-foreground",
    green: "bg-success/10 text-success",
    teal: "bg-teal-500/10 text-teal-600",
    slate: "bg-slate-500/10 text-slate-600",
    rose: "bg-rose-500/10 text-rose-600",
    indigo: "bg-indigo-500/10 text-indigo-500",
  };
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 rounded-2xl border border-border/60 bg-white p-3.5 shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] overflow-hidden"
    >
      <div
        className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", colors[tone])}
      >
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
