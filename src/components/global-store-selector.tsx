import { useState, useEffect, useRef } from "react";
import { Building2, ChevronDown, Search, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { supabase, type Store } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function GlobalStoreSelector() {
  const { user, userStores, activeStore, setActiveStore } = useAuth();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [allStores, setAllStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const hierarchyLevel = user?.hierarchy_level;
  const isAboveStore =
    user?.role === "admin" ||
    hierarchyLevel === "hk" ||
    hierarchyLevel === "forening" ||
    hierarchyLevel === "distrikt";

  useEffect(() => {
    if (!open || !isAboveStore) return;
    setLoading(true);
    let query = supabase
      .from("stores")
      .select("*")
      .order("name");

    if (hierarchyLevel === "forening" && user?.forening_id) {
      query = supabase.from("stores").select("*").eq("forening_id", user.forening_id).order("name");
    } else if (hierarchyLevel === "distrikt" && user?.distrikt_id) {
      query = supabase.from("stores").select("*").eq("distrikt_id", user.distrikt_id).order("name");
    }

    query.then(({ data }) => {
      setAllStores((data ?? []) as Store[]);
      setLoading(false);
    });
  }, [open, isAboveStore, hierarchyLevel, user?.forening_id, user?.distrikt_id]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (!isAboveStore) return null;

  const stores = allStores.length > 0 ? allStores : userStores;
  const filtered = search.trim()
    ? stores.filter(
        (s) =>
          s.name.toLowerCase().includes(search.toLowerCase()) ||
          s.city?.toLowerCase().includes(search.toLowerCase()) ||
          s.bolag?.toLowerCase().includes(search.toLowerCase()) ||
          s.butiks_nr?.includes(search) ||
          s.distrikt_namn?.toLowerCase().includes(search.toLowerCase()),
      )
    : stores;

  return (
    <div ref={containerRef} className="relative hidden md:flex">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full border-border/80 text-xs max-w-[280px]"
      >
        <Building2 className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{activeStore?.name ?? "Välj butik"}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </Button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-80 overflow-hidden rounded-xl border border-border/60 bg-card shadow-lg">
          <div className="border-b border-border/40 p-2">
            <div className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2">
              <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <input
                autoFocus
                type="text"
                placeholder="Sök butik, stad, förening..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              {search && (
                <button onClick={() => setSearch("")}>
                  <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto">
            {loading ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">Laddar...</p>
            ) : filtered.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">Inga butiker hittades</p>
            ) : (
              filtered.map((s) => {
                const isSelected = activeStore?.id === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => { setActiveStore(s); setOpen(false); setSearch(""); }}
                    className={cn(
                      "flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/50",
                      isSelected && "bg-primary/5 text-primary",
                    )}
                  >
                    <Building2 className={cn("mt-0.5 h-4 w-4 shrink-0", isSelected ? "text-primary" : "text-muted-foreground")} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{s.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[s.butiks_nr && `#${s.butiks_nr}`, s.city, s.bolag].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    {isSelected && (
                      <span className="shrink-0 text-[10px] text-primary">Aktiv</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
          <div className="border-t border-border/40 px-3 py-2">
            <p className="text-[10px] text-muted-foreground">
              {filtered.length} butik{filtered.length !== 1 ? "er" : ""}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
