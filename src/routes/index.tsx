import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
import { getKundrundaAssignmentsThisWeek, supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/")({
  component: HubPage,
});

function HubPage() {
  const { user, activeStore } = useAuth();
  const navigate = useNavigate();
  const [missingPinUsers, setMissingPinUsers] = useState<
    { id: string; display_name: string; username: string }[]
  >([]);

  // Omdirigera oinloggade användare till quick-login (PIN + butik)
  useEffect(() => {
    if (!user) {
      navigate({ to: "/quick-login" });
    }
  }, [user, navigate]);

  // Varning för chefer/admin om användare utan PIN i aktuell butik
  const isManager = user?.role === "manager" || user?.role === "admin";
  useEffect(() => {
    if (!user || !isManager || !activeStore?.id) return;
    (async () => {
      const { data } = await supabase
        .from("app_users")
        .select("id, display_name, username, quick_pin_hash")
        .eq("store_id", activeStore.id)
        .is("quick_pin_hash", null);
      if (data) setMissingPinUsers(data as typeof missingPinUsers);
    })();
  }, [user, isManager, activeStore?.id]);

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
          <h1 className="text-3xl font-black tracking-tight text-coop-gray-900 md:text-5xl">
            Vad ska du göra idag?
          </h1>
          {activeStore && (
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-coop-gray-900">
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
              tone="info"
            />
          </ErrorBoundary>
          <ErrorBoundary section="Avvikelser" fallback={<WidgetFallback name="Avvikelser" />}>
            <QuickCard
              to="/avvikelser"
              icon={AlertTriangle}
              title="Avvikelser"
              desc="Rapportera ärenden"
              tone="warning"
            />
          </ErrorBoundary>
          <ErrorBoundary section="Schema" fallback={<WidgetFallback name="Schema" />}>
            <QuickCard
              to="/schema"
              icon={CalendarDays}
              title="Schema"
              desc="Skiftöversikt"
              tone="primary"
            />
          </ErrorBoundary>
          <ErrorBoundary section="Kundrunda" fallback={<WidgetFallback name="Kundrunda" />}>
            <QuickCard
              to="/kundrunda"
              icon={UserRound}
              title="Kundrunda"
              desc="Butikskontroll"
              tone="primary"
            />
          </ErrorBoundary>
          <ErrorBoundary section="Kundönskemål" fallback={<WidgetFallback name="Kundönskemål" />}>
            <QuickCard
              to="/kundonskemal"
              icon={ShoppingCart}
              title="Kundönskemål"
              desc="Produktförfrågningar"
              tone="destructive"
            />
          </ErrorBoundary>
          {isManager && missingPinUsers.length > 0 && (
            <div className="col-span-full mb-4 rounded-2xl border-2 border-amber-400 bg-amber-50/70 p-4 shadow-md">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-6 w-6 shrink-0 text-amber-600 mt-0.5" />
                <div>
                  <h3 className="font-bold text-amber-800">Varning: Saknade PIN-koder</h3>
                  <p className="text-sm text-amber-700 mt-1">
                    Följande användare i <strong>{activeStore?.name ?? "butiken"}</strong> saknar
                    PIN-kod och kan inte logga in med snabbbytesmetoden:
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-amber-800">
                    {missingPinUsers.map((u) => (
                      <li key={u.id} className="flex items-center gap-2">
                        <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                        <span className="font-medium">{u.display_name || u.username}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
          {isManager && (
            <>
              <ErrorBoundary section="Rapporter" fallback={<WidgetFallback name="Rapporter" />}>
                <QuickCard
                  to="/rapporter"
                  icon={BarChart3}
                  title="Rapporter"
                  desc="KPI:er och insikter"
                  tone="accent"
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
  tone: "info" | "warning" | "success" | "primary" | "muted" | "destructive" | "accent";
}) {
  const colors = {
    info: "bg-info/10 text-info",
    warning: "bg-warning/15 text-warning-foreground",
    success: "bg-success/10 text-success",
    primary: "bg-primary-soft text-coop-gron-600",
    muted: "bg-muted text-coop-gray-900",
    destructive: "bg-coop-red-100 text-coop-red-600",
    accent: "bg-coop-accent text-coop-morkgron",
  };
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 rounded-2xl border border-border/60 bg-coop-gray-100 p-3.5 shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] overflow-hidden"
    >
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
          colors[tone],
          `${tone === "primary" ? "text-coop-gron-600" : "text-coop-gray-600"}`,
        )}
      >
        <Icon className="h-4.5 w-4.5" />
      </div>
      <div className="min-w-0 flex-1 overflow-hidden">
        <p className="font-semibold text-sm text-coop-gray-900 truncate leading-tight">{title}</p>
        <p className="mt-0.5 text-xs text-coop-gray-900 truncate leading-tight">{desc}</p>
      </div>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-coop-gray-900/40 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
