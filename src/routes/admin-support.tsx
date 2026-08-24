import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  Mail,
  ShieldCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  supabase,
  type SupportTicket,
  logAudit,
  insertSupportTicket,
  errorToSwedish,
} from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { exportCSV as downloadCSVRows } from "@/lib/csv";

export const Route = createFileRoute("/admin-support")({
  component: AdminSupportPage,
});

function AdminSupportPage() {
  const { user, activeStore, loading: authLoading } = useAuth();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<"all" | "open" | "closed">("open");
  const [search, setSearch] = useState("");
  const [detailTicket, setDetailTicket] = useState<SupportTicket | null>(null);
  const [reply, setReply] = useState("");
  const [replying, setReplying] = useState(false);

  useEffect(() => {
    if (!user || user.role !== "admin") return;
    fetchTickets();
  }, [user?.id, filterStatus]);

  const fetchTickets = async () => {
    setLoading(true);
    let q = supabase.from("support_tickets").select("*").order("created_at", { ascending: false });
    if (filterStatus !== "all") {
      q = q.eq("status", filterStatus === "open" ? "open" : "closed");
    }
    const { data } = await q;
    if (data) setTickets(data as SupportTicket[]);
    setLoading(false);
  };

  const exportCSV = () => {
    const rows = [
      [
        "ID",
        "Skapad",
        "Status",
        "Användare",
        "Butik",
        "App-version",
        "Kö-längd",
        "Senaste fel",
        "Komponenter",
        "Meddelande",
      ],
      ...tickets.map((t) => [
        t.id,
        new Date(t.created_at).toLocaleString("sv-SE"),
        t.status,
        t.user_id ?? "—",
        t.store_id ?? "—",
        t.app_version ?? "—",
        t.offline_queue_length ?? 0,
        t.last_error ?? "—",
        t.components?.join(", ") ?? "—",
        t.message ?? "—",
      ]),
    ];
    downloadCSVRows(rows, `support-tickets-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const openDetail = (t: SupportTicket) => setDetailTicket(t);
  const closeDetail = () => {
    setDetailTicket(null);
    setReply("");
  };

  const resolveTicket = async (id: string) => {
    const { error } = await supabase
      .from("support_tickets")
      .update({ status: "closed", resolved_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast.error(errorToSwedish(error));
      return;
    }
    toast.success("Ärende markerat som löst");
    logAudit(user?.id ?? null, "support.resolve", "support_tickets", id, {});
    fetchTickets();
    closeDetail();
  };

  const reopenTicket = async (id: string) => {
    const { error } = await supabase
      .from("support_tickets")
      .update({ status: "open", resolved_at: null })
      .eq("id", id);
    if (error) {
      toast.error(errorToSwedish(error));
      return;
    }
    toast.success("Ärende återöppnat");
    logAudit(user?.id ?? null, "support.reopen", "support_tickets", id, {});
    fetchTickets();
    closeDetail();
  };

  const sendReply = async () => {
    if (!reply.trim()) return;
    setReplying(true);
    const { error } = await supabase.from("support_replies").insert({
      ticket_id: detailTicket!.id,
      user_id: user?.id,
      message: reply.trim(),
    });
    if (error) {
      toast.error(errorToSwedish(error));
      setReplying(false);
      return;
    }
    toast.success("Svar skickat");
    logAudit(user?.id ?? null, "support.reply", "support_tickets", detailTicket!.id, {
      reply: reply.trim(),
    });
    setReply("");
    setReplying(false);
    fetchTickets();
    openDetail({ ...detailTicket!, status: "open" } as SupportTicket);
  };

  const STATUS_LABELS: Record<string, string> = { open: "Öppet", closed: "Löst" };
  const STATUS_TONE: Record<string, "default" | "destructive" | "outline" | "secondary"> = {
    open: "destructive",
    closed: "secondary",
  };
  const tone = (s: string): "default" | "destructive" | "outline" | "secondary" =>
    STATUS_TONE[s] ?? "secondary";

  const filtered = tickets.filter(
    (t) =>
      t.id.toLowerCase().includes(search.toLowerCase()) ||
      (t.message ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (t.user_id ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (t.store_id ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }
  if (!user || user.role !== "admin") {
    return (
      <div className="flex items-center justify-center h-64 text-center">
        <div className="max-w-md">
          <ShieldCheck className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
          <h2 className="text-xl font-semibold">Endast administratörer</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Du har inte behörighet att se supportärenden.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] px-5 py-8 md:px-8 md:py-10">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <PageHeader
          title="Supportärenden"
          description="Hantera inkomna supportärenden från användare"
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportCSV} className="rounded-full gap-2">
            <Download className="h-4 w-4" /> Exportera CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <Input
          placeholder="Sök i ärenden..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 max-w-xs"
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as "all" | "open" | "closed")}
          className="flex h-10 w-full max-w-xs items-center rounded-lg border border-border/60 bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="open">Öppna ärenden</option>
          <option value="closed">Lösta ärenden</option>
          <option value="all">Alla</option>
        </select>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-2xl border border-border/50 bg-card p-4 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="h-4 w-10 rounded bg-muted" />
                <div className="flex-1">
                  <div className="h-3 w-1/4 rounded bg-muted" />
                  <div className="mt-1 h-3 w-1/6 rounded bg-muted/60" />
                </div>
                <div className="h-5 w-16 rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-card py-16 text-center">
          <AlertCircle className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">
            {tickets.length === 0 ? "Inga supportärenden" : "Inga ärenden matchar sökningen"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((t) => (
            <div
              key={t.id}
              className="rounded-2xl border border-border/60 bg-card p-4 shadow-[var(--shadow-sm)] transition-shadow hover:shadow-[var(--shadow-md)]"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Badge variant={tone(t.status)} className="text-xs shrink-0">
                    {STATUS_LABELS[t.status] ?? t.status}
                  </Badge>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {t.message?.slice(0, 80) ?? "Ingen beskrivning"}
                    </p>
                    <p className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                      <span>#{t.id.slice(0, 8)}</span>
                      <span>•</span>
                      <span>{new Date(t.created_at).toLocaleString("sv-SE")}</span>
                      <span>•</span>
                      <span>App: {t.app_version ?? "?"}</span>
                      <span>•</span>
                      <span>Kö: {t.offline_queue_length ?? 0}</span>
                      {t.store_id && (
                        <>
                          <span>•</span>
                          <span>Butik: {t.store_id.slice(0, 8)}</span>
                        </>
                      )}
                      {t.components?.length && (
                        <>
                          <span>•</span>
                          <span>Komponenter: {t.components.join(", ")}</span>
                        </>
                      )}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openDetail(t)}
                  className="rounded-full shrink-0"
                >
                  <Eye className="h-3.5 w-3.5" />
                </Button>
              </div>
              {t.last_error && (
                <div className="mt-3 p-3 rounded-lg bg-destructive/5 text-destructive text-xs font-mono overflow-x-auto">
                  {t.last_error}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Detail Dialog */}
      {detailTicket && (
        <Dialog open onOpenChange={closeDetail}>
          <DialogContent className="sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between">
                <span>Ärende #{detailTicket.id.slice(0, 8)}</span>
                <Badge variant={tone(detailTicket.status)}>
                  {STATUS_LABELS[detailTicket.status] ?? detailTicket.status}
                </Badge>
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Skapad:</span>{" "}
                  <span className="ml-2 font-mono">
                    {new Date(detailTicket.created_at).toLocaleString("sv-SE")}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Status:</span>{" "}
                  <span className="ml-2">
                    {STATUS_LABELS[detailTicket.status] ?? detailTicket.status}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Användare:</span>{" "}
                  <span className="ml-2 font-mono">{detailTicket.user_id ?? "—"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Butik:</span>{" "}
                  <span className="ml-2 font-mono">{detailTicket.store_id ?? "—"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">App-version:</span>{" "}
                  <span className="ml-2 font-mono">{detailTicket.app_version ?? "—"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Offline-kö:</span>{" "}
                  <span className="ml-2">{detailTicket.offline_queue_length ?? 0}</span>
                </div>
                {detailTicket.components?.length && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Komponenter:</span>{" "}
                    <span className="ml-2">{detailTicket.components.join(", ")}</span>
                  </div>
                )}
                {detailTicket.resolved_at && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Löst:</span>{" "}
                    <span className="ml-2 font-mono">
                      {new Date(detailTicket.resolved_at).toLocaleString("sv-SE")}
                    </span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Meddelande från användare
                </label>
                <Textarea
                  value={detailTicket.message ?? ""}
                  readOnly
                  className="bg-muted/50"
                  rows={3}
                />
              </div>

              {detailTicket.last_error && (
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    Senaste fel
                  </label>
                  <Textarea
                    value={detailTicket.last_error}
                    readOnly
                    className="bg-destructive/5 text-destructive font-mono"
                    rows={2}
                  />
                </div>
              )}

              {detailTicket.idb_usage && (
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    IndexedDB-användning
                  </label>
                  <Textarea
                    value={detailTicket.idb_usage}
                    readOnly
                    className="bg-muted/50 font-mono"
                    rows={1}
                  />
                </div>
              )}

              <div className="border-t border-border/60 pt-4">
                <label className="block text-sm font-medium text-muted-foreground mb-2">
                  Svara / Kommentera
                </label>
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Skriv svar..."
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    rows={2}
                    className="flex-1"
                  />
                  <div className="flex flex-col gap-2">
                    <Button
                      onClick={sendReply}
                      disabled={replying || !reply.trim()}
                      className="rounded-full"
                    >
                      {replying ? "Skickar..." : "Skicka"}
                    </Button>
                    {detailTicket.status === "open" ? (
                      <Button
                        variant="outline"
                        onClick={() => resolveTicket(detailTicket.id)}
                        className="rounded-full gap-2"
                      >
                        <ShieldCheck className="h-3.5 w-3.5" /> Markera löst
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        onClick={() => reopenTicket(detailTicket.id)}
                        className="rounded-full gap-2"
                      >
                        <X className="h-3.5 w-3.5" /> Återöppna
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Replies history */}
              <div className="border-t border-border/60 pt-4">
                <h4 className="text-sm font-medium mb-2">Historik</h4>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {/* Future: fetch replies from support_replies table */}
                  <p className="text-xs text-muted-foreground text-center py-4">Inga svar än</p>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
