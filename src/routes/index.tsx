import { createFileRoute, Link } from "@tanstack/react-router";
import { TriangleAlert as AlertTriangle, ArrowRight, ChartBar as BarChart3, ListChecks, Store } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/")({
  component: HubPage,
});

type Action = {
  to: string;
  title: string;
  desc: string;
  cta: string;
  icon: LucideIcon;
  tone: "pink" | "mint" | "blue" | "amber";
  badge?: string;
};

const primary: Action[] = [
  {
    to: "/uppgifter",
    title: "Dagens uppgifter",
    desc: "Se och slutför dina rutiner och checklistor",
    cta: "Till uppgifter",
    icon: ListChecks,
    tone: "pink",
  },
  {
    to: "/avvikelser",
    title: "Avvikelser",
    desc: "Rapportera och följ upp ärenden i butiken",
    cta: "Till avvikelser",
    icon: AlertTriangle,
    tone: "mint",
  },
];

const secondary: Action[] = [
  {
    to: "/rapporter",
    title: "Rapporter",
    desc: "KPI:er, trender och insikter",
    cta: "Till rapporter",
    icon: BarChart3,
    tone: "blue",
  },
];

const toneBg: Record<Action["tone"], string> = {
  pink: "bg-accent",
  mint: "bg-primary-soft",
  blue: "bg-info/15",
  amber: "bg-warning/20",
};
const toneFg: Record<Action["tone"], string> = {
  pink: "text-accent-foreground",
  mint: "text-primary",
  blue: "text-info",
  amber: "text-warning-foreground",
};

function ActionCard({ a, large = false }: { a: Action; large?: boolean }) {
  return (
    <Link
      to={a.to}
      className={cn(
        "group flex flex-col items-center rounded-3xl bg-card text-center shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]",
        large ? "p-8 md:p-10" : "p-6 md:p-7",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center rounded-full",
          toneBg[a.tone],
          large ? "h-20 w-20" : "h-16 w-16",
        )}
      >
        <a.icon className={cn(toneFg[a.tone], large ? "h-9 w-9" : "h-7 w-7")} />
      </div>

      <h3
        className={cn(
          "mt-5 font-bold tracking-tight",
          large ? "text-xl md:text-2xl" : "text-lg",
        )}
      >
        {a.title}
      </h3>
      <p className="mt-1.5 max-w-[28ch] text-sm text-muted-foreground">{a.desc}</p>

      {a.badge && (
        <span className="mt-3 inline-flex items-center rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">
          {a.badge}
        </span>
      )}

      <div className="mt-auto w-full pt-6">
        <span className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-sm)] transition-[...]
          {a.cta}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}

function HubPage() {
  const { user } = useAuth();
  const [storeName, setStoreName] = useState("Laddar...");
  const [storeRegion, setStoreRegion] = useState("Laddar...");

  useEffect(() => {
    const loadUserStore = async () => {
      if (user?.store_id) {
        const { data } = await supabase
          .from("stores")
          .select("name, region")
          .eq("id", user.store_id)
          .maybeSingle();
        if (data) {
          setStoreName(data.name);
          setStoreRegion(data.region || "");
        }
      }
    };
    loadUserStore();
  }, [user]);

  return (
    <div className="mx-auto w-full max-w-[1400px] px-5 py-12 md:px-8 md:py-20">
      <div className="text-center">
        <p className="text-sm font-medium text-primary">{storeName} {storeRegion && `· ${storeRegion}`}</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight text-foreground md:text-6xl">
          Vad ska du göra idag?
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground">
          Allt du behöver för butikens dagliga drift — på ett ställe.
        </p>
      </div>

      <div className="mx-auto mt-12 grid max-w-3xl grid-cols-1 gap-5 sm:grid-cols-2 md:mt-16">
        {primary.map((a) => (
          <ActionCard key={a.to} a={a} large />
        ))}
      </div>

      <div className="mx-auto mt-10 max-w-5xl">
        <div className="mb-5 flex items-end justify-between px-1">
          <h2 className="text-lg font-bold tracking-tight">Mer i StoreFlow</h2>
          <Link to="/uppgifter" className="text-sm font-medium text-primary hover:underline">
            Visa allt
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {secondary.map((a) => (
            <ActionCard key={a.to} a={a} />
          ))}
        </div>
      </div>
    </div>
  );
}
