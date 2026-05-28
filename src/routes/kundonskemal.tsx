import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Copy, ExternalLink, Hash, Plus, QrCode, ScanLine, Search, ShoppingCart, Store as StoreIcon, Trash2,
} from "lucide-react";
import { CameraScanner } from "@/components/camera-scanner";
import { QrDisplay } from "@/components/qr-display";
import { PageHeader, StatCard } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  supabase, type CustomerRequest, type Store as StoreType,
  mittCoopUrl,
} from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/kundonskemal")({
  component: CustomerRequestsPage,
});

const STATUS_LABELS: Record<string, string> = {
  open: "Inkommit",
  ordered: "Beställd",
  declined: "Avböjd",
  fulfilled: "Uppfylld",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Låg",
  normal: "Normal",
  high: "Hög",
};

function statusBadge(s: string) {
  if (s === "ordered") return <Badge className="bg-info/15 text-info">Beställd</Badge>;
  if (s === "fulfilled") return <Badge className="bg-success/15 text-success">Uppfylld</Badge>;
  if (s === "declined") return <Badge variant="secondary" className="text-muted-foreground">Avböjd</Badge>;
  return <Badge variant="secondary">Inkommit</Badge>;
}

function priorityClass(p: string) {
  if (p === "high") return "bg-destructive/10 text-destructive";
  if (p === "low") return "bg-muted text-muted-foreground";
  return "bg-info/15 text-info";
}

const emptyForm = () => ({
  product_name: "",
  article_number: "",
  notes: "",
  priority: "normal" as "low" | "normal" | "high",
});

function CustomerRequestsPage() {
  const { user, activeStore, userStores } = useAuth();
  const isAdmin = user?.role === "admin";
  const isManager = user?.role === "manager" || isAdmin;

  const [requests, setRequests] = useState<CustomerRequest[]>([]);
  const [stores, setStores] = useState<StoreType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("active");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [articleCameraOpen, setArticleCameraOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CustomerRequest | null>(null);
  const [editTarget, setEditTarget] = useState<CustomerRequest | null>(null);
  const [editStatus, setEditStatus] = useState<CustomerRequest["status"]>("open");
  const [editNotes, setEditNotes] = useState("");
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrRequest, setQrRequest] = useState<CustomerRequest | null>(null);
  const [qrTokenUrl, setQrTokenUrl] = useState("");
  const [showStoreQrModal, setShowStoreQrModal] = useState(false);
  const [storeQrToken, setStoreQrToken] = useState("");
  const [storeQrLoading, setStoreQrLoading] = useState(false);
  const [copiedQr, setCopiedQr] = useState(false);
  const [editComment, setEditComment] = useState("");

  const openQrForRequest = async (req: CustomerRequest) => {
    if (!activeStore || !user) return;
    setQrTokenUrl("");
    setQrRequest(req);
    setShowQrModal(true);
    const { data: existing } = await supabase
      .from("qr_tokens")
      .select("token")
      .eq("store_id", activeStore.id)
      .eq("token_type", "customer_request_status")
      .contains("meta", { request_id: req.id })
      .maybeSingle();
    if (existing) {
      setQrTokenUrl(`${window.location.origin}/qr-kundonskemal?token=${existing.token}`);
    } else {
      const { data: created } = await supabase.from("qr_tokens").insert({
        token_type: "customer_request_status",
        store_id: activeStore.id,
        meta: { request_id: req.id },
        created_by: user.id,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }).select("token").maybeSingle();
      if (created) setQrTokenUrl(`${window.location.origin}/qr-kundonskemal?token=${created.token}`);
    }
  };

  const openStoreQr = async () => {
    if (!activeStore || !user) return;
    setStoreQrToken("");
    setStoreQrLoading(true);
    setShowStoreQrModal(true);
    const { data: existing } = await supabase
      .from("qr_tokens")
      .select("token")
      .eq("store_id", activeStore.id)
      .eq("token_type", "customer_request_form")
      .maybeSingle();
    if (existing) {
      setStoreQrToken(existing.token);
    } else {
      const { data: created } = await supabase.from("qr_tokens").insert({
        token_type: "customer_request_form",
        store_id: activeStore.id,
        meta: {},
        created_by: user.id,
      }).select("token").maybeSingle();
      if (created) setStoreQrToken(created.token);
    }
    setStoreQrLoading(false);
  };

  const fetchRequests = async () => {
    let q = supabase
      .from("customer_requests")
      .select("*, requester:app_users!requested_by(display_name), store:stores(name)")
      .order("created_at", { ascending: false });
    if (activeStore) {
      q = q.eq("store_id", activeStore.id);
    } else if (userStores.length > 0) {
      q = q.in("store_id", userStores.map((s) => s.id));
    }
    const { data } = await q;
    if (data) setRequests(data as CustomerRequest[]);
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    fetchRequests();
    if (isAdmin) {
      supabase.from("stores").select("*").eq("is_active", true).then(({ data }) => {
        if (data) setStores(data as StoreType[]);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStore, user]);

  const createRequest = async () => {
    if (!form.product_name.trim()) return;
    setSaving(true);
    await supabase.from("customer_requests").insert({
      store_id: activeStore?.id,
      product_name: form.product_name.trim(),
      article_number: form.article_number.trim() || null,
      notes: form.notes.trim() || null,
      priority: form.priority,
      requested_by: user?.id,
    });
    setSaving(false);
    setShowCreate(false);
    setForm(emptyForm());
    await fetchRequests();
  };

  const updateRequest = async () => {
    if (!editTarget) return;
    setSaving(true);
    await supabase.from("customer_requests").update({
      status: editStatus,
      notes: editNotes.trim() || null,
      staff_comment: editComment.trim() || null,
    }).eq("id", editTarget.id);
    setSaving(false);
    setEditTarget(null);
    await fetchRequests();
  };

  const deleteRequest = async () => {
    if (!deleteTarget) return;
    await supabase.from("customer_requests").delete().eq("id", deleteTarget.id);
    setDeleteTarget(null);
    await fetchRequests();
  };

  const filtered = requests.filter((r) => {
    if (filterStatus === "active" && (r.status === "fulfilled" || r.status === "declined")) return false;
    if (filterStatus !== "active" && filterStatus !== "all" && r.status !== filterStatus) return false;
    if (search && !r.product_name.toLowerCase().includes(search.toLowerCase()) && !(r.article_number ?? "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const open = requests.filter((r) => r.status === "open").length;
  const ordered = requests.filter((r) => r.status === "ordered").length;
  const fulfilled = requests.filter((r) => r.status === "fulfilled").length;

  return (
    <div className="mx-auto max-w-[1200px] px-5 py-8 md:px-8 md:py-10">
      <PageHeader
        title="Kundönskemål"
        description={activeStore ? `Önskemål från kunder i ${activeStore.name}` : "Produktönskemål från kunder."}
        actions={
          <div className="flex gap-2">
            {isManager && activeStore && (
              <Button variant="outline" className="rounded-full hidden lg:flex gap-1.5" onClick={openStoreQr}>
                <StoreIcon className="h-4 w-4" /> Butiks-QR
              </Button>
            )}
            <Button className="rounded-full hidden lg:flex" onClick={() => setShowCreate(true)}>
              <Plus className="mr-2 h-4 w-4" /> Nytt önskemål
            </Button>
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-3 gap-4">
        <StatCard label="Inkomna" value={open} tone="default" />
        <StatCard label="Beställda" value={ordered} tone="success" />
        <StatCard label="Uppfyllda" value={fulfilled} tone="success" />
      </div>

      {/* Filters */}
      <div className="mb-5 space-y-2">
        <div className="overflow-x-auto -mx-5 px-5 sm:mx-0 sm:px-0">
          <div className="flex w-max rounded-full border border-border/60 bg-muted/40 p-0.5 sm:w-auto sm:flex-wrap">
            {[
              { value: "active", label: "Aktiva" },
              { value: "all", label: "Alla" },
              { value: "open", label: "Inkomna" },
              { value: "ordered", label: "Beställda" },
              { value: "fulfilled", label: "Uppfyllda" },
              { value: "declined", label: "Avböjda" },
            ].map((f) => (
              <button
                key={f.value}
                onClick={() => setFilterStatus(f.value)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap",
                  filterStatus === f.value
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Sök produkt eller artikelnummer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 rounded-full pl-9 text-sm"
          />
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
              <div className="h-4 w-3/4 animate-pulse rounded-md bg-muted" />
              <div className="h-3 w-1/2 animate-pulse rounded-md bg-muted/60" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-card py-16 text-center">
          <ShoppingCart className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">Inga kundönskemål hittades</p>
          <Button className="mt-4 rounded-full" size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Registrera önskemål
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((r) => {
            const store = stores.find((s) => s.id === r.store_id) ?? null;
            const mcUrl = mittCoopUrl(r.article_number, store?.sap_site_id ?? activeStore?.sap_site_id ?? null);
            return (
              <div
                key={r.id}
                className="rounded-2xl border border-border/60 bg-card p-4 space-y-3 hover:border-border transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm leading-tight truncate">{r.product_name}</p>
                    {r.article_number && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <Hash className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                        <span className="text-xs text-muted-foreground font-mono">{r.article_number}</span>
                        {mcUrl && (
                          <a
                            href={mcUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1.5">
                    {statusBadge(r.status)}
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", priorityClass(r.priority))}>
                      {PRIORITY_LABELS[r.priority]}
                    </span>
                  </div>
                </div>

                {r.notes && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{r.notes}</p>
                )}

                <div className="flex items-center justify-between pt-1 border-t border-border/40">
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
                    {r.requester?.display_name && (
                      <span>{r.requester.display_name}</span>
                    )}
                    <span>·</span>
                    <span>{new Date(r.created_at).toLocaleDateString("sv-SE")}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {isManager && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 rounded-full px-2 text-xs"
                        onClick={() => {
                          setEditTarget(r);
                          setEditStatus(r.status);
                          setEditNotes(r.notes ?? "");
                          setEditComment((r as CustomerRequest & { staff_comment?: string }).staff_comment ?? "");
                        }}
                      >
                        Hantera
                      </Button>
                    )}
                    <button
                      type="button"
                      onClick={() => openQrForRequest(r)}
                      className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted/60 hover:text-primary transition-colors"
                      title="Dela status-QR med kund"
                    >
                      <QrCode className="h-3.5 w-3.5" />
                    </button>
                    {isManager && (
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(r)}
                        className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted/60 hover:text-destructive transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={(o) => { setShowCreate(o); if (!o) setForm(emptyForm()); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrera kundönskemål</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Produktnamn *</Label>
              <Input
                placeholder="T.ex. Oatly iKaffe 1L..."
                value={form.product_name}
                onChange={(e) => setForm((p) => ({ ...p, product_name: e.target.value }))}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                <Hash className="h-3 w-3 text-muted-foreground" />
                Artikelnummer (SAP / Mitt Coop-sortiment, valfritt)
              </Label>
              <Input
                placeholder="T.ex. 123456"
                value={form.article_number}
                onChange={(e) => setForm((p) => ({ ...p, article_number: e.target.value }))}
              />
              <p className="text-[11px] text-muted-foreground">
                Artikelnumret används för direktlänk till Mitt Coop-sortiment.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Prioritet</Label>
              <Select value={form.priority} onValueChange={(v) => setForm((p) => ({ ...p, priority: v as typeof p.priority }))}>
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Låg</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">Hög</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Anteckning (valfritt)</Label>
                <button
                  type="button"
                  onClick={() => setArticleCameraOpen(true)}
                  className="flex items-center gap-1 rounded-full border border-border/60 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                  title="Scanna EAN-kod och klistra in i anteckningen"
                >
                  <ScanLine className="h-3 w-3" />
                  Scanna EAN
                </button>
              </div>
              <Textarea
                placeholder="Ev. kommentar från kunden eller övrig info..."
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                rows={3}
                className="resize-none text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                Scanna EAN-kod för att klistra in i anteckningen. Sök sedan upp artikelnumret manuellt i Mitt Coop-sortiment.
              </p>
            </div>

            {articleCameraOpen && (
              <CameraScanner
                onScan={(code) => {
                  setArticleCameraOpen(false);
                  setForm(p => ({ ...p, notes: p.notes ? `${p.notes}\nEAN: ${code}` : `EAN: ${code}` }));
                }}
                onClose={() => setArticleCameraOpen(false)}
              />
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" className="rounded-full" onClick={() => setShowCreate(false)}>Avbryt</Button>
            <Button
              className="rounded-full"
              disabled={!form.product_name.trim() || saving}
              onClick={createRequest}
            >
              {saving ? "Sparar..." : "Registrera"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit/manage dialog (managers only) */}
      {editTarget && (
        <Dialog open onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Hantera önskemål</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
                <p className="font-medium text-sm">{editTarget.product_name}</p>
                {editTarget.article_number && (
                  <p className="text-xs text-muted-foreground mt-0.5 font-mono">#{editTarget.article_number}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <Select value={editStatus} onValueChange={(v) => setEditStatus(v as typeof editStatus)}>
                  <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Meddelande till kund (visas på statuslänk)</Label>
                <Textarea
                  value={editComment}
                  onChange={(e) => setEditComment(e.target.value)}
                  rows={2}
                  className="resize-none text-sm"
                  placeholder="T.ex. Varan är nu i hylla 3, kyl..."
                />
                <p className="text-[11px] text-muted-foreground">Kunden ser detta meddelande på sin statuslänk.</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Intern anteckning</Label>
                <Textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={2}
                  className="resize-none text-sm"
                  placeholder="Intern info, syns inte för kunden..."
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" className="rounded-full" onClick={() => setEditTarget(null)}>Avbryt</Button>
              <Button className="rounded-full" disabled={saving} onClick={updateRequest}>
                {saving ? "Sparar..." : "Spara"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort önskemål?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.product_name}" tas bort permanent.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteRequest}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Ta bort
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Mobile FAB */}
      <button
        className="fixed bottom-28 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[var(--shadow-lg)] transition-transform active:scale-95 lg:hidden"
        aria-label="Nytt önskemål"
        onClick={() => setShowCreate(true)}
      >
        <Plus className="h-6 w-6" />
      </button>

      {/* QR-status dialog */}
      {showQrModal && qrRequest && (
        <Dialog open onOpenChange={(o) => { if (!o) { setShowQrModal(false); setQrRequest(null); setQrTokenUrl(""); setCopiedQr(false); } }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                  <QrCode className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <DialogTitle className="text-base">Dela status med kund</DialogTitle>
                  <p className="text-xs text-muted-foreground">Kunden kan följa önskemålets status via denna QR-kod.</p>
                </div>
              </div>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground mb-0.5">Produkt</p>
                <p className="font-medium text-sm text-foreground">{qrRequest.product_name}</p>
              </div>
              {qrTokenUrl ? (
                <div className="space-y-3">
                  <div className="flex justify-center rounded-2xl border border-border/60 bg-white p-4">
                    <QrDisplay url={qrTokenUrl} size={180} />
                  </div>
                  <div className="rounded-xl border border-border/60 bg-muted/20 p-2.5">
                    <p className="break-all font-mono text-[10px] text-muted-foreground leading-relaxed">{qrTokenUrl}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 rounded-full"
                      onClick={() => {
                        navigator.clipboard?.writeText(qrTokenUrl).catch(() => {});
                        setCopiedQr(true);
                        setTimeout(() => setCopiedQr(false), 2000);
                      }}
                    >
                      <Copy className="mr-1.5 h-3.5 w-3.5" />
                      {copiedQr ? "Kopierat!" : "Kopiera länk"}
                    </Button>
                    <a
                      href={qrTokenUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-border/60 bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Öppna
                    </a>
                  </div>
                  <p className="text-xs text-center text-muted-foreground">Länken är giltig i 30 dagar.</p>
                </div>
              ) : (
                <div className="flex items-center justify-center py-8">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Store QR modal */}
      {showStoreQrModal && (
        <Dialog open onOpenChange={(o) => { if (!o) { setShowStoreQrModal(false); setStoreQrToken(""); setCopiedQr(false); } }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                  <StoreIcon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <DialogTitle className="text-base">Butiks-QR för kundönskemål</DialogTitle>
                  <p className="text-xs text-muted-foreground">Kunder kan skanna och skicka in önskemål direkt.</p>
                </div>
              </div>
            </DialogHeader>
            <div className="space-y-4">
              {storeQrLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              ) : storeQrToken ? (
                <>
                  <div className="flex justify-center rounded-2xl border border-border/60 bg-white p-4">
                    <QrDisplay url={`${window.location.origin}/qr-kundonskemal-form?token=${storeQrToken}`} size={200} />
                  </div>
                  <div className="rounded-xl border border-border/60 bg-muted/20 p-2.5">
                    <p className="break-all font-mono text-[10px] text-muted-foreground leading-relaxed">
                      {`${window.location.origin}/qr-kundonskemal-form?token=${storeQrToken}`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 rounded-full"
                      onClick={() => {
                        const url = `${window.location.origin}/qr-kundonskemal-form?token=${storeQrToken}`;
                        navigator.clipboard?.writeText(url).catch(() => {});
                        setCopiedQr(true);
                        setTimeout(() => setCopiedQr(false), 2000);
                      }}
                    >
                      <Copy className="mr-1.5 h-3.5 w-3.5" />
                      {copiedQr ? "Kopierat!" : "Kopiera länk"}
                    </Button>
                    <a
                      href={`${window.location.origin}/qr-kundonskemal-form?token=${storeQrToken}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-border/60 bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Testa
                    </a>
                  </div>
                  <p className="text-xs text-center text-muted-foreground">
                    Skriv ut och sätt upp i butiken. Kunder skannar och skickar önskemål direkt.
                  </p>
                </>
              ) : (
                <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 py-8 text-center">
                  <p className="text-sm text-muted-foreground">Kunde inte generera QR-kod</p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
