import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { TriangleAlert as AlertTriangle, ArrowUpRight, Clock, ListFilter as Filter, Plus, Store, TrendingUp, X } from "lucide-react";

import { PageHeader, StatCard } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase, type Incident, type Store as StoreType } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/avvikelser")({
  component: IssuesPage,
});

function priorityClass(p: string) {
  switch (p) {
    case "Kritisk": return "bg-destructive/10 text-destructive";
    case "Hög": return "bg-warning/20 text-warning-foreground";
    case "Medel": return "bg-info/15 text-info";
    default: return "bg-muted text-muted-foreground";
  }
}

function statusBadge(s: string) {
  if (s === "escalated") return <Badge className="bg-destructive/10 text-destructive hover:bg-destructive/15">Eskalerad</Badge>;
  if (s === "in_progress") return <Badge className="bg-info/15 text-info hover:bg-info/20">Pågår</Badge>;
  if (s === "resolved") return <Badge className="bg-success/15 text-success hover:bg-success/20">Löst</Badge>;
  if (s === "closed") return <Badge variant="secondary">Stängt</Badge>;
  return <Badge variant="secondary">Ny</Badge>;
}

type IncidentWithStore = Incident & { store?: StoreType };

function IssuesPage() {
  const { user } = useAuth();
  const [incidents, setIncidents] = useState<IncidentWithStore[]>([]);
  const [stores, setStores] = useState<StoreType[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState<IncidentWithStore | null>(null);
  const [newIncident, setNewIncident] = useState({
    title: "",
    description: "",
    category: "",
    store_id: "",
    priority: "Medel",
  });
  const [saving, setSaving] = useState(false);

  const fetchIncidents = async () => {
    const { data } = await supabase
      .from("incidents")
      .select("*, store:stores(*)")
      .order("created_at", { ascending: false });
    if (data) setIncidents(data as IncidentWithStore[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchIncidents();
    supabase.from("stores").select("*").eq("is_active", true).then(({ data }) => {
      if (data) setStores(data);
    });
  }, []);

  const createIncident = async () => {
    if (!newIncident.title) return;
    setSaving(true);
    const refNumber = `AVV-${Date.now().toString().slice(-4)}`;
    await supabase.from("incidents").insert({
      ...newIncident,
      store_id: newIncident.store_id || null,
      ref_number: refNumber,
      reported_by: user?.id,
      status: "open",
    });
    await fetchIncidents();
    setSaving(false);
    setShowCreate(false);
    setNewIncident({ title: "", description: "", category: "", store_id: "", priority: "Medel" });
  };

  const updateStatus = async (id: string, status: string) => {
    await supabase.from("incidents").update({
      status,
      resolved_at: status === "resolved" ? new Date().toISOString() : null,
    }).eq("id", id);
    await fetchIncidents();
    setShowDetail(null);
  };

  const filtered = filterStatus === "all" ? incidents : incidents.filter((i) => i.status === filterStatus);

  const open = incidents.filter((i) => ["open", "in_progress", "escalated"].includes(i.status));
  const escalated = incidents.filter((i) => i.status === "escalated");
  const resolved = incidents.filter((i) => i.status === "resolved");

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-8 md:px-8 md:py-10">
      <PageHeader
        title="Avvikelser"
        description="Incidenter, ärenden och eskaleringar."
        actions={
          <>
            <Button variant="outline" className="rounded-full" onClick={() => setFilterStatus(filterStatus === "all" ? "open" : "all")}>
              <Filter className="mr-2 h-4 w-4" />
              {filterStatus === "all" ? "Visa öppna" : "Visa alla"}
            </Button>
            <Button className="rounded-full" onClick={() => setShowCreate(true)}>
              <Plus className="mr-2 h-4 w-4" /> Rapportera avvikelse
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Öppna" value={String(open.length)} hint={`${escalated.length} eskalerade`} icon={AlertTriangle} tone="destructive" />
        <StatCard label="Eskalerade" value={String(escalated.length)} hint="till regionchef" icon={ArrowUpRight} tone="warning" />
        <StatCard label="Lösta" value={String(resolved.length)} delta="denna period" icon={TrendingUp} tone="success" />
        <StatCard label="Totalt" value={String(incidents.length)} hint="alla ärenden" icon={Clock} tone="info" />
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[var(--shadow-sm)]">
        <header className="flex items-center justify-between border-b border-border/60 p-5">
          <div>
            <h2 className="text-base font-semibold tracking-tight">Ärenden</h2>
            <p className="text-xs text-muted-foreground">Sorterat efter senaste</p>
          </div>
        </header>

        {loading ? (
          <div className="p-5 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <AlertTriangle className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">Inga avvikelser hittades</p>
            <Button className="mt-4 rounded-full" size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Rapportera avvikelse
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {filtered.map((i) => (
              <li
                key={i.id}
                className="group flex cursor-pointer flex-col gap-3 p-5 transition-colors hover:bg-muted/30 md:flex-row md:items-center md:gap-5"
                onClick={() => setShowDetail(i)}
              >
                <div className="flex items-start gap-3 md:w-[40%]">
                  <div className={cn(
                    "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                    i.priority === "Kritisk" ? "bg-destructive/10 text-destructive"
                      : i.priority === "Hög" ? "bg-warning/20 text-warning-foreground"
                      : "bg-primary-soft text-accent-foreground",
                  )}>
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-xs text-muted-foreground">{i.ref_number}</span>
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", priorityClass(i.priority))}>
                        {i.priority}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-sm font-medium">{i.title}</p>
                    {i.category && <p className="truncate text-xs text-muted-foreground">{i.category}</p>}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground md:flex-1">
                  {i.store && (
                    <span className="inline-flex items-center gap-1.5">
                      <Store className="h-3.5 w-3.5" />{i.store.name}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    {new Date(i.created_at).toLocaleDateString("sv-SE")}
                  </span>
                </div>

                <div className="flex items-center justify-end gap-3">
                  {statusBadge(i.status)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Rapportera avvikelse</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Titel</Label>
              <Input
                placeholder="Beskriv avvikelsen kortfattat"
                value={newIncident.title}
                onChange={(e) => setNewIncident((p) => ({ ...p, title: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Beskrivning</Label>
              <Textarea
                placeholder="Detaljerad beskrivning..."
                value={newIncident.description}
                onChange={(e) => setNewIncident((p) => ({ ...p, description: e.target.value }))}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Kategori</Label>
                <Input
                  placeholder="T.ex. Teknikproblem"
                  value={newIncident.category}
                  onChange={(e) => setNewIncident((p) => ({ ...p, category: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Prioritet</Label>
                <Select value={newIncident.priority} onValueChange={(v) => setNewIncident((p) => ({ ...p, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Låg", "Medel", "Hög", "Kritisk"].map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Butik</Label>
              <Select value={newIncident.store_id} onValueChange={(v) => setNewIncident((p) => ({ ...p, store_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Välj butik (valfritt)" /></SelectTrigger>
                <SelectContent>
                  {stores.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Avbryt</Button>
            <Button onClick={createIncident} disabled={saving || !newIncident.title}>
              {saving ? "Sparar..." : "Rapportera"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!showDetail} onOpenChange={(o) => !o && setShowDetail(null)}>
        {showDetail && (
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span className="font-mono text-sm text-muted-foreground">{showDetail.ref_number}</span>
                <span>{showDetail.title}</span>
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="flex flex-wrap gap-2">
                <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", priorityClass(showDetail.priority))}>
                  {showDetail.priority}
                </span>
                {statusBadge(showDetail.status)}
                {showDetail.store && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs">
                    <Store className="h-3 w-3" />{showDetail.store.name}
                  </span>
                )}
              </div>
              {showDetail.description && (
                <p className="text-sm text-muted-foreground">{showDetail.description}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Rapporterad: {new Date(showDetail.created_at).toLocaleString("sv-SE")}
              </p>
            </div>
            <DialogFooter className="flex-wrap gap-2">
              {showDetail.status === "open" && (
                <Button size="sm" variant="outline" onClick={() => updateStatus(showDetail.id, "in_progress")}>
                  Starta hantering
                </Button>
              )}
              {showDetail.status === "in_progress" && (
                <>
                  <Button size="sm" variant="outline" onClick={() => updateStatus(showDetail.id, "escalated")}>
                    Eskalera
                  </Button>
                  <Button size="sm" onClick={() => updateStatus(showDetail.id, "resolved")}>
                    Markera löst
                  </Button>
                </>
              )}
              {showDetail.status === "escalated" && (
                <Button size="sm" onClick={() => updateStatus(showDetail.id, "resolved")}>
                  Markera löst
                </Button>
              )}
              {showDetail.status === "resolved" && (
                <Button size="sm" variant="outline" onClick={() => updateStatus(showDetail.id, "closed")}>
                  Stäng ärende
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setShowDetail(null)}>
                <X className="mr-1.5 h-3.5 w-3.5" /> Stäng
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
