import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Building2,
  Mail,
  MapPin,
  Phone,
  Search,
  Store,
  User,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react";
import { supabase, type Store as StoreType } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/butiksregister")({
  component: ButiksregisterPage,
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-coop-gray-600/70">
        {label}
      </p>
      <p className="text-sm text-coop-gray-900 truncate">{value}</p>
    </div>
  );
}

function StoreCard({ store }: { store: StoreType }) {
  const [expanded, setExpanded] = useState(false);

  const hasExtra = !!(
    store.butikschef ||
    store.email_sm_chef ||
    store.telefon_butik ||
    store.bc_telefon ||
    store.mobil ||
    store.organisationsnummer ||
    store.distriktschef ||
    store.forsaljningschef ||
    store.direktor_forsaljning ||
    store.marknadsomrade ||
    store.k_stalle ||
    store.saljplan ||
    store.hr_generalist ||
    store.bemanningsspecialist ||
    store.sak_kval_samordnare ||
    store.enhet ||
    store.foretag ||
    store.gamla_butiksnummer
  );

  return (
    <div className="rounded-2xl border border-border/60 bg-coop-gray-100 shadow-[var(--shadow-sm)] overflow-hidden transition-shadow hover:shadow-[var(--shadow-md)]">
      {/* Header */}
      <div className="px-4 py-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <Store className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-semibold text-coop-gray-900 truncate">{store.name}</h3>
              {store.koncept && (
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-coop-gray-600">
                  {store.koncept}
                </span>
              )}
              {store.franchise && (
                <span className="shrink-0 rounded-full bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                  Franchise
                </span>
              )}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-coop-gray-600">
              {store.butiks_nr && <span className="font-mono">#{store.butiks_nr}</span>}
              {store.bolag && <span>{store.bolag}</span>}
              {store.distrikt_namn && <span>{store.distrikt_namn}</span>}
            </div>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(store.id)}
              title="Klicka för att kopiera UUID"
              className="mt-1 flex items-center gap-1 rounded font-mono text-[10px] text-coop-gray-600/70 hover:text-primary transition-colors"
            >
              UUID: {store.id}
            </button>
          </div>
        </div>

        {/* Core contact info */}
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(store.gatuadress || store.postadress || store.postnr) && (
            <div className="flex items-start gap-2 text-sm text-coop-gray-600">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-coop-gray-600/60" />
              <span className="min-w-0">
                {store.gatuadress && <span className="block truncate">{store.gatuadress}</span>}
                {(store.postnr || store.postadress) && (
                  <span className="block truncate">
                    {[store.postnr, store.postadress].filter(Boolean).join(" ")}
                  </span>
                )}
              </span>
            </div>
          )}
          {store.telefon_butik && (
            <div className="flex items-center gap-2 text-sm text-coop-gray-600">
              <Phone className="h-3.5 w-3.5 shrink-0 text-coop-gray-600/60" />
              <a
                href={`tel:${store.telefon_butik}`}
                className="truncate hover:text-primary transition-colors"
              >
                {store.telefon_butik}
              </a>
            </div>
          )}
          {(store.email || store.email_sm_chef) && (
            <div className="flex items-center gap-2 text-sm text-coop-gray-600">
              <Mail className="h-3.5 w-3.5 shrink-0 text-coop-gray-600/60" />
              <a
                href={`mailto:${store.email || store.email_sm_chef}`}
                className="truncate hover:text-primary transition-colors"
              >
                {store.email || store.email_sm_chef}
              </a>
            </div>
          )}
          {store.butikschef && (
            <div className="flex items-center gap-2 text-sm text-coop-gray-600">
              <User className="h-3.5 w-3.5 shrink-0 text-coop-gray-600/60" />
              <span className="truncate">{store.butikschef}</span>
            </div>
          )}
        </div>
      </div>

      {/* Expandable extra details */}
      {hasExtra && (
        <>
          {expanded && (
            <div className="border-t border-border/40 bg-muted/20 px-4 py-3">
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
                <Field label="Distriktschef" value={store.distriktschef} />
                <Field label="Försäljningschef" value={store.forsaljningschef} />
                <Field label="Direktör Försäljning" value={store.direktor_forsaljning} />
                <Field label="BC Telefon" value={store.bc_telefon} />
                <Field label="Mobil" value={store.mobil} />
                <Field label="HR Generalist" value={store.hr_generalist} />
                <Field label="Bemanningsspecialist" value={store.bemanningsspecialist} />
                <Field label="Sak/Kval samordnare" value={store.sak_kval_samordnare} />
                <Field label="Marknadsområde" value={store.marknadsomrade} />
                <Field label="Företag" value={store.foretag} />
                <Field label="Enhet" value={store.enhet} />
                <Field label="Org.nummer" value={store.organisationsnummer} />
                <Field label="K Ställe" value={store.k_stalle} />
                <Field label="Säljplan" value={store.saljplan} />
                <Field label="Gamla butiksnummer" value={store.gamla_butiksnummer} />
                <Field label="Kommun" value={store.kommun} />
                {store.site_id && <Field label="Site-ID" value={store.site_id} />}
              </div>
            </div>
          )}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex w-full items-center justify-center gap-1.5 border-t border-border/40 bg-muted/10 py-2 text-xs font-medium text-coop-gray-600 transition-colors hover:bg-muted/30 hover:text-coop-gray-900"
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" /> Visa mindre
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" /> Visa mer
              </>
            )}
          </button>
        </>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function ButiksregisterPage() {
  const [stores, setStores] = useState<StoreType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterDistrikt, setFilterDistrikt] = useState("");
  const [filterBolag, setFilterBolag] = useState("");

  useEffect(() => {
    supabase
      .from("stores")
      .select("*")
      .order("name")
      .then(({ data }) => {
        setStores((data ?? []) as StoreType[]);
        setLoading(false);
      });
  }, []);

  const distriktOptions = [
    ...new Set(stores.map((s) => s.distrikt_namn).filter(Boolean)),
  ].sort() as string[];
  const bolagOptions = [...new Set(stores.map((s) => s.bolag).filter(Boolean))].sort() as string[];

  const filtered = stores.filter((s) => {
    if (filterDistrikt && s.distrikt_namn !== filterDistrikt) return false;
    if (filterBolag && s.bolag !== filterBolag) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q) ||
      (s.butiks_nr && s.butiks_nr.includes(q)) ||
      (s.butikschef && s.butikschef.toLowerCase().includes(q)) ||
      (s.distrikt_namn && s.distrikt_namn.toLowerCase().includes(q)) ||
      (s.bolag && s.bolag.toLowerCase().includes(q)) ||
      (s.postadress && s.postadress.toLowerCase().includes(q)) ||
      (s.kommun && s.kommun.toLowerCase().includes(q))
    );
  });

  const hasFilters = search || filterDistrikt || filterBolag;

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 md:px-8 md:py-10">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-coop-gray-900">Butiksregister</h1>
            <p className="text-sm text-coop-gray-600">
              {loading ? "Laddar..." : `${stores.length} butiker`}
            </p>
          </div>
        </div>
      </div>

      {/* Search & filters */}
      <div className="mb-6 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-coop-gray-600 pointer-events-none" />
          <input
            type="text"
            placeholder="Sök butik, chef, ort..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full rounded-xl border border-border/60 bg-coop-gray-100 pl-9 pr-3 text-sm outline-none placeholder:text-coop-gray-600 focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-coop-gray-600 hover:text-coop-gray-900"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {distriktOptions.length > 0 && (
          <select
            value={filterDistrikt}
            onChange={(e) => setFilterDistrikt(e.target.value)}
            className={cn(
              "h-10 rounded-xl border border-border/60 bg-coop-gray-100 px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 cursor-pointer",
              filterDistrikt ? "text-coop-gray-900" : "text-coop-gray-600",
            )}
          >
            <option value="">Alla distrikt</option>
            {distriktOptions.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        )}

        {bolagOptions.length > 0 && (
          <select
            value={filterBolag}
            onChange={(e) => setFilterBolag(e.target.value)}
            className={cn(
              "h-10 rounded-xl border border-border/60 bg-coop-gray-100 px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 cursor-pointer",
              filterBolag ? "text-coop-gray-900" : "text-coop-gray-600",
            )}
          >
            <option value="">Alla föreningar</option>
            {bolagOptions.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        )}

        {hasFilters && (
          <button
            onClick={() => {
              setSearch("");
              setFilterDistrikt("");
              setFilterBolag("");
            }}
            className="flex h-10 items-center gap-1.5 rounded-xl border border-border/60 bg-coop-gray-100 px-3 text-sm text-coop-gray-600 transition-colors hover:bg-muted hover:text-coop-gray-900"
          >
            <X className="h-3.5 w-3.5" />
            Rensa
          </button>
        )}
      </div>

      {/* Result count */}
      {hasFilters && !loading && (
        <p className="mb-4 text-sm text-coop-gray-600">
          {filtered.length} av {stores.length} butiker
        </p>
      )}

      {/* Store grid */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-border/60 bg-coop-gray-100 p-4 shadow-[var(--shadow-sm)]"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-xl bg-muted animate-pulse" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-4 w-32 rounded bg-muted animate-pulse" />
                  <div className="h-3 w-20 rounded bg-muted animate-pulse" />
                </div>
              </div>
              <div className="space-y-2">
                <div className="h-3 w-full rounded bg-muted animate-pulse" />
                <div className="h-3 w-3/4 rounded bg-muted animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-border/60 bg-coop-gray-100 p-10 text-center shadow-[var(--shadow-sm)]">
          <Store className="mx-auto mb-3 h-10 w-10 text-coop-gray-600/40" />
          <p className="text-sm font-medium text-coop-gray-600">Inga butiker hittades</p>
          {hasFilters && (
            <button
              onClick={() => {
                setSearch("");
                setFilterDistrikt("");
                setFilterBolag("");
              }}
              className="mt-3 text-xs text-primary hover:underline"
            >
              Rensa filter
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((store) => (
            <StoreCard key={store.id} store={store} />
          ))}
        </div>
      )}
    </div>
  );
}
