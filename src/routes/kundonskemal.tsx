import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Copy, ExternalLink, Hash, ImagePlus, Plus, QrCode, ScanLine, Search, ShoppingCart, Store as StoreIcon, Trash2, X, ChevronDown,
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
  mittCoopUrlFromStored, mittCoopSearchUrl, mittCoopUrl, encodeArticleNumber, decodeArticleNumber,
  MITT_COOP_CATEGORIES, MITT_COOP_STATUS_CODES, type ArticleIdType,
  getPublicUrl, uploadAttachment, deleteStorageFiles,
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
  article_type: "mat-nr" as ArticleIdType,
  mitt_coop_category_id: null as number | null,
  mitt_coop_status_code: null as number | null,
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
  // 3-way disambiguation for manually typed article numbers
  const [articlePrompt, setArticlePrompt] = useState<{ value: string; target: "create" | "edit" } | null>(null);
  // Category search state for the combobox
  const [categorySearch, setCategorySearch] = useState("");
  const [editCategorySearch, setEditCategorySearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CustomerRequest | null>(null);
  const [editTarget, setEditTarget] = useState<CustomerRequest | null>(null);
  const [editStatus, setEditStatus] = useState<CustomerRequest["status"]>("open");
  const [editNotes, setEditNotes] = useState("");
  const [editInternalNotes, setEditInternalNotes] = useState("");
  const [editArticleNumber, setEditArticleNumber] = useState("");
  const [editArticleType, setEditArticleType] = useState<ArticleIdType>("mat-nr");
  const [editCategoryId, setEditCategoryId] = useState<number | null>(null);
  const [editStatusCode, setEditStatusCode] = useState<number | null>(null);
  const [detailTarget, setDetailTarget] = useState<CustomerRequest | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrRequest, setQrRequest] = useState<CustomerRequest | null>(null);
  const [qrTokenUrl, setQrTokenUrl] = useState("");
  const [showStoreQrModal, setShowStoreQrModal] = useState(false);
  const [storeQrToken, setStoreQrToken] = useState("");
  const [storeQrLoading, setStoreQrLoading] = useState(false);
  const [copiedQr, setCopiedQr] = useState(false);
  const [editComment, setEditComment] = useState("");
  // Mitt Coop link builder (standalone, no article number required)
  const [showLinkBuilder, setShowLinkBuilder] = useState(false);
  const [linkBuilderMode, setLinkBuilderMode] = useState<"filter" | "search">("filter");
  const [linkBuilderCategoryId, setLinkBuilderCategoryId] = useState<number | null>(null);
  const [linkBuilderStatusCode, setLinkBuilderStatusCode] = useState<number | null>(null);
  const [linkBuilderProductName, setLinkBuilderProductName] = useState("");
  const [linkBuilderCategorySearch, setLinkBuilderCategorySearch] = useState("");

  // Image upload for create/edit (staff)
  const [createImages, setCreateImages] = useState<File[]>([]);
  const [createPreviews, setCreatePreviews] = useState<string[]>([]);
  const createFileRef = useRef<HTMLInputElement>(null);
  const [editImages, setEditImages] = useState<File[]>([]);
  const [editPreviews, setEditPreviews] = useState<string[]>([]);
  const editFileRef = useRef<HTMLInputElement>(null);
  // Images loaded for the currently open request (detail + edit dialog)
  const [requestImages, setRequestImages] = useState<{ id: string; storage_path: string }[]>([]);

  const MAX_IMAGES = 5;

  const loadRequestImages = async (requestId: string) => {
    const { data } = await supabase
      .from("customer_request_images")
      .select("id, storage_path")
      .eq("request_id", requestId)
      .order("created_at");
    setRequestImages(data ?? []);
  };

  const addCreateImages = async (files: FileList | null, inputEl?: HTMLInputElement | null) => {
    if (!files || files.length === 0) return;
    const remaining = MAX_IMAGES - createImages.length;
    const toAdd = Array.from(files).slice(0, remaining);
    if (inputEl) inputEl.value = "";
    setCreateImages((prev) => [...prev, ...toAdd]);
    setCreatePreviews((prev) => [...prev, ...toAdd.map((f) => URL.createObjectURL(f))]);
  };

  const removeCreateImage = (i: number) => {
    URL.revokeObjectURL(createPreviews[i]);
    setCreateImages((prev) => prev.filter((_, idx) => idx !== i));
    setCreatePreviews((prev) => prev.filter((_, idx) => idx !== i));
  };

  const addEditImages = async (files: FileList | null, inputEl?: HTMLInputElement | null) => {
    if (!files || files.length === 0) return;
    const remaining = MAX_IMAGES - (requestImages.length + editImages.length);
    const toAdd = Array.from(files).slice(0, remaining);
    if (inputEl) inputEl.value = "";
    setEditImages((prev) => [...prev, ...toAdd]);
    setEditPreviews((prev) => [...prev, ...toAdd.map((f) => URL.createObjectURL(f))]);
  };

  const removeEditImage = (i: number) => {
    URL.revokeObjectURL(editPreviews[i]);
    setEditImages((prev) => prev.filter((_, idx) => idx !== i));
    setEditPreviews((prev) => prev.filter((_, idx) => idx !== i));
  };

  const deleteExistingImage = async (imgId: string) => {
    const img = requestImages.find((i) => i.id === imgId);
    await supabase.from("customer_request_images").delete().eq("id", imgId);
    if (img) deleteStorageFiles([img.storage_path]);
    setRequestImages((prev) => prev.filter((i) => i.id !== imgId));
  };

  const uploadImages = async (requestId: string, files: File[]) => {
    for (const img of files) {
      const path = await uploadAttachment(img, `customer-requests/${requestId}`);
      if (path) {
        await supabase.from("customer_request_images").insert({
          request_id: requestId,
          storage_path: path,
          uploaded_by: user?.id ?? null,
        });
      }
    }
  };

  // Load images whenever a detail or edit dialog opens
  useEffect(() => {
    const id = detailTarget?.id ?? editTarget?.id;
    if (id) {
      loadRequestImages(id);
    } else {
      setRequestImages([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailTarget?.id, editTarget?.id]);

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
      setQrTokenUrl(`${window.location.origin}/qr-kundonskemal?t=${existing.token}`);
    } else {
      const { data: created } = await supabase.from("qr_tokens").insert({
        token_type: "customer_request_status",
        store_id: activeStore.id,
        meta: { request_id: req.id },
        created_by: user.id,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }).select("token").maybeSingle();
      if (created) setQrTokenUrl(`${window.location.origin}/qr-kundonskemal?t=${created.token}`);
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
    const storedArticle = form.article_number.trim()
      ? encodeArticleNumber(form.article_number.trim(), form.article_type)
      : null;
    const { data: inserted } = await supabase.from("customer_requests").insert({
      store_id: activeStore?.id,
      product_name: form.product_name.trim(),
      article_number: storedArticle,
      notes: form.notes.trim() || null,
      priority: form.priority,
      requested_by: user?.id,
      mitt_coop_category_id: form.mitt_coop_category_id,
      mitt_coop_status_code: form.mitt_coop_status_code,
    }).select("id").maybeSingle();
    if (inserted?.id && createImages.length > 0) {
      await uploadImages(inserted.id, createImages);
    }
    setSaving(false);
    setShowCreate(false);
    setForm(emptyForm());
    createPreviews.forEach((p) => URL.revokeObjectURL(p));
    setCreateImages([]);
    setCreatePreviews([]);
    await fetchRequests();
  };

  const updateRequest = async () => {
    if (!editTarget) return;
    setSaving(true);
    const storedArticle = editArticleNumber.trim()
      ? encodeArticleNumber(editArticleNumber.trim(), editArticleType)
      : null;
    await supabase.from("customer_requests").update({
      status: editStatus,
      article_number: storedArticle,
      internal_notes: editInternalNotes.trim() || null,
      staff_comment: editComment.trim() || null,
      mitt_coop_category_id: editCategoryId,
      mitt_coop_status_code: editStatusCode,
    }).eq("id", editTarget.id);
    if (editImages.length > 0) {
      await uploadImages(editTarget.id, editImages);
    }
    setSaving(false);
    editPreviews.forEach((p) => URL.revokeObjectURL(p));
    setEditImages([]);
    setEditPreviews([]);
    setRequestImages([]);
    setEditTarget(null);
    await fetchRequests();
  };

  const deleteRequest = async () => {
    if (!deleteTarget) return;
    // Fetch image paths before deleting so we can clean up storage
    const { data: imgs } = await supabase
      .from("customer_request_images")
      .select("storage_path")
      .eq("request_id", deleteTarget.id);
    await supabase.from("customer_requests").delete().eq("id", deleteTarget.id);
    if (imgs && imgs.length > 0) {
      deleteStorageFiles(imgs.map((i) => i.storage_path));
    }
    setDeleteTarget(null);
    await fetchRequests();
  };

  // 3-way disambiguation for manually typed article numbers (not for scanned barcodes)
  const handleArticleInput = (value: string, target: "create" | "edit") => {
    if (!value.trim()) return;
    setArticlePrompt({ value: value.trim(), target });
  };

  const siteId = activeStore?.sap_site_id ?? null;

  // Build the Mitt Coop URL from a stored article_number + optional category/status
  const buildMcUrl = (
    articleNumber: string | null | undefined,
    storeSapSiteId: string | null | undefined,
    categoryId?: number | null,
    statusCode?: number | null,
  ): string | null =>
    mittCoopUrlFromStored(articleNumber, storeSapSiteId, {
      categoryId: categoryId ?? undefined,
      statusCode: statusCode ?? undefined,
    });

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

      {/* Mitt Coop Link Builder */}
      <div className="mb-5 rounded-2xl border border-border/60 bg-card overflow-hidden">
        <button
          onClick={() => setShowLinkBuilder(v => !v)}
          className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
        >
          <ExternalLink className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-medium">Mitt Coop-länkverktyg</span>
          <ChevronDown className={cn("ml-auto h-4 w-4 text-muted-foreground transition-transform", showLinkBuilder && "rotate-180")} />
        </button>
        {showLinkBuilder && (
          <div className="border-t border-border/60 px-4 py-4 space-y-4">
            <div className="flex gap-1 rounded-full border border-border/60 bg-muted/40 p-0.5 w-max">
              <button
                onClick={() => setLinkBuilderMode("filter")}
                className={cn("rounded-full px-3 py-1 text-xs font-medium transition-colors", linkBuilderMode === "filter" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
              >
                Filtrera (status/kategori)
              </button>
              <button
                onClick={() => setLinkBuilderMode("search")}
                className={cn("rounded-full px-3 py-1 text-xs font-medium transition-colors", linkBuilderMode === "search" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
              >
                Sök produktnamn
              </button>
            </div>

            {linkBuilderMode === "filter" ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Kategori (valfri)</label>
                  <div className="relative">
                    <input
                      value={linkBuilderCategorySearch}
                      onChange={(e) => setLinkBuilderCategorySearch(e.target.value)}
                      placeholder="Sök kategori..."
                      className="w-full h-8 rounded-lg border border-border/60 bg-background px-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
                    />
                    {linkBuilderCategorySearch && (
                      <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-lg border border-border/60 bg-card shadow-md">
                        {linkBuilderCategoryId && (
                          <button className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-muted/50 text-destructive" onClick={() => { setLinkBuilderCategoryId(null); setLinkBuilderCategorySearch(""); }}>
                            Rensa kategori
                          </button>
                        )}
                        {MITT_COOP_CATEGORIES.filter(c => c.label.toLowerCase().includes(linkBuilderCategorySearch.toLowerCase())).slice(0, 12).map(c => (
                          <button key={c.id} className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-muted/50 text-left" onClick={() => { setLinkBuilderCategoryId(c.id); setLinkBuilderCategorySearch(c.label); }}>
                            {c.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {linkBuilderCategoryId && !linkBuilderCategorySearch && (
                    <p className="text-[10px] text-muted-foreground">{MITT_COOP_CATEGORIES.find(c => c.id === linkBuilderCategoryId)?.label}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Status (valfri)</label>
                  <select
                    value={linkBuilderStatusCode ?? ""}
                    onChange={(e) => setLinkBuilderStatusCode(e.target.value ? Number(e.target.value) : null)}
                    className="w-full h-8 rounded-lg border border-border/60 bg-background px-3 text-xs focus:outline-none"
                  >
                    <option value="">Alla statusar</option>
                    {MITT_COOP_STATUS_CODES.map(s => <option key={s.code} value={s.code}>{s.label}</option>)}
                  </select>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Produktnamn / sökord</label>
                <input
                  value={linkBuilderProductName}
                  onChange={(e) => setLinkBuilderProductName(e.target.value)}
                  placeholder="t.ex. oat milk, havremjölk..."
                  className="w-full h-8 rounded-lg border border-border/60 bg-background px-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
              </div>
            )}

            {(() => {
              let builtUrl: string | null = null;
              if (linkBuilderMode === "filter") {
                builtUrl = mittCoopUrl("", siteId, { categoryId: linkBuilderCategoryId ?? undefined, statusCode: linkBuilderStatusCode ?? undefined });
                if (!builtUrl && siteId) builtUrl = `https://mittcoop.coop.se/sortiment/artiklar?siteId=${siteId}${linkBuilderCategoryId ? `&categoryIds=${linkBuilderCategoryId}` : ""}${linkBuilderStatusCode ? `&statusCodes=${linkBuilderStatusCode}` : ""}`;
                else if (!builtUrl) builtUrl = `https://mittcoop.coop.se/sortiment/artiklar?${linkBuilderCategoryId ? `categoryIds=${linkBuilderCategoryId}` : ""}${linkBuilderStatusCode ? `&statusCodes=${linkBuilderStatusCode}` : ""}`;
              } else {
                if (linkBuilderProductName.trim()) {
                  builtUrl = mittCoopSearchUrl(linkBuilderProductName.trim(), siteId, { categoryId: linkBuilderCategoryId ?? undefined, statusCode: linkBuilderStatusCode ?? undefined });
                }
              }
              if (!builtUrl) return <p className="text-xs text-muted-foreground">Fyll i minst ett fält för att generera en länk.</p>;
              return (
                <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2">
                  <a href={builtUrl} target="_blank" rel="noopener noreferrer"
                    className="flex-1 text-xs text-primary hover:underline truncate font-mono">{builtUrl}</a>
                  <a href={builtUrl} target="_blank" rel="noopener noreferrer"
                    className="shrink-0 inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                    <ExternalLink className="h-3 w-3" /> Öppna
                  </a>
                </div>
              );
            })()}
          </div>
        )}
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
            placeholder="Sök produkt eller materialnummer..."
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
            const mcUrl = buildMcUrl(r.article_number, store?.sap_site_id ?? activeStore?.sap_site_id ?? null, r.mitt_coop_category_id, r.mitt_coop_status_code);
            return (
              <div
                key={r.id}
                className="rounded-2xl border border-border/60 bg-card p-4 space-y-3 hover:border-border transition-colors cursor-pointer"
                onClick={() => setDetailTarget(r)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm leading-tight truncate">{r.product_name}</p>
                    {r.article_number && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <Hash className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                        <span className="text-xs text-muted-foreground font-mono">{decodeArticleNumber(r.article_number)?.value ?? r.article_number}</span>
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
                  <div className="rounded-lg bg-muted/50 px-2.5 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70 mb-0.5">Kundens kommentar</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">{r.notes}</p>
                  </div>
                )}

                <div className="flex items-center justify-between pt-1 border-t border-border/40" onClick={(e) => e.stopPropagation()}>
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
                          const decoded = decodeArticleNumber(r.article_number);
                          setEditTarget(r);
                          setEditStatus(r.status);
                          setEditArticleNumber(decoded?.value ?? "");
                          setEditArticleType(decoded?.type ?? "mat-nr");
                          setEditCategoryId(r.mitt_coop_category_id ?? null);
                          setEditStatusCode(r.mitt_coop_status_code ?? null);
                          setEditCategorySearch("");
                          setEditInternalNotes(r.internal_notes ?? "");
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
      <Dialog open={showCreate} onOpenChange={(o) => { setShowCreate(o); if (!o) { setForm(emptyForm()); createPreviews.forEach((p) => URL.revokeObjectURL(p)); setCreateImages([]); setCreatePreviews([]); } }}>
        <DialogContent className="w-full max-w-md sm:max-w-md mx-0 sm:mx-auto">
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
                Materialnummer / EAN / BNR (valfritt)
              </Label>
              <div className="flex gap-2">
                <Input
                  placeholder={form.article_type === "mat-nr" ? "T.ex. 1047133" : form.article_type === "ean" ? "T.ex. 7310865003294" : "T.ex. 123456"}
                  value={form.article_number}
                  onChange={(e) => setForm((p) => ({ ...p, article_number: e.target.value.replace(/\D/g, "") }))}
                  onBlur={(e) => { if (e.target.value.trim()) handleArticleInput(e.target.value.trim(), "create"); }}
                  inputMode="numeric"
                  className="font-mono text-sm"
                />
                <Select value={form.article_type} onValueChange={(v) => setForm((p) => ({ ...p, article_type: v as ArticleIdType }))}>
                  <SelectTrigger className="w-28 shrink-0 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mat-nr">Mat-nr</SelectItem>
                    <SelectItem value="ean">EAN</SelectItem>
                    <SelectItem value="bnr">BNR</SelectItem>
                  </SelectContent>
                </Select>
                <button
                  type="button"
                  onClick={() => setArticleCameraOpen(true)}
                  className="flex items-center gap-1 shrink-0 rounded-xl border border-border/60 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                  title="Scanna EAN-streckkod"
                >
                  <ScanLine className="h-3 w-3" />
                  Scanna
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Används för direktlänk till Mitt Coop-sortiment. Ange typ av nummer i rullgardinen.
              </p>
            </div>
            {/* Mitt Coop category */}
            <div className="space-y-1.5">
              <Label className="text-xs">Kategori i Mitt Coop (valfritt)</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Sök kategori..."
                  value={categorySearch}
                  onChange={(e) => setCategorySearch(e.target.value)}
                  className="pl-8 text-xs h-8"
                />
              </div>
              {form.mitt_coop_category_id && (
                <div className="flex items-center gap-1.5">
                  <Badge variant="secondary" className="text-xs font-mono">
                    {MITT_COOP_CATEGORIES.find(c => c.id === form.mitt_coop_category_id)?.label ?? form.mitt_coop_category_id}
                  </Badge>
                  <button type="button" onClick={() => setForm(p => ({ ...p, mitt_coop_category_id: null }))} className="text-muted-foreground hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
              {categorySearch && (
                <div className="max-h-36 overflow-y-auto rounded-xl border border-border/60 bg-card shadow-sm">
                  {MITT_COOP_CATEGORIES.filter(c =>
                    c.label.toLowerCase().includes(categorySearch.toLowerCase()) ||
                    String(c.id).includes(categorySearch)
                  ).slice(0, 20).map(c => (
                    <button
                      key={c.id}
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted/50 transition-colors"
                      onClick={() => { setForm(p => ({ ...p, mitt_coop_category_id: c.id })); setCategorySearch(""); }}
                    >
                      <span className="font-mono text-muted-foreground">{c.id}</span>
                      <span>{c.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* Mitt Coop status filter */}
            <div className="space-y-1.5">
              <Label className="text-xs">Statusfilter i Mitt Coop (valfritt)</Label>
              <Select
                value={form.mitt_coop_status_code ? String(form.mitt_coop_status_code) : "none"}
                onValueChange={(v) => setForm(p => ({ ...p, mitt_coop_status_code: v === "none" ? null : Number(v) }))}
              >
                <SelectTrigger className="text-xs h-8"><SelectValue placeholder="Välj status..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Inget filter</SelectItem>
                  {MITT_COOP_STATUS_CODES.map(s => (
                    <SelectItem key={s.code} value={String(s.code)}>{s.code.toString().padStart(2, "0")} — {s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              <Label className="text-xs">Anteckning (valfritt)</Label>
              <Textarea
                placeholder="Ev. kommentar från kunden eller övrig info..."
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                rows={3}
                className="resize-none text-sm"
              />
            </div>

            {articleCameraOpen && (
              <CameraScanner
                onScan={(code) => {
                  setArticleCameraOpen(false);
                  setForm(p => ({ ...p, article_number: code.replace(/\D/g, ""), article_type: "ean" }));
                }}
                onClose={() => setArticleCameraOpen(false)}
              />
            )}

            {/* Images */}
            <div className="space-y-2">
              <Label className="text-xs">Bilder (valfritt, max {MAX_IMAGES})</Label>
              {createPreviews.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {createPreviews.map((src, i) => (
                    <div key={i} className="relative h-16 w-16 overflow-hidden rounded-lg border border-border/60">
                      <img src={src} alt="" className="h-full w-full object-cover" />
                      <button type="button" onClick={() => removeCreateImage(i)}
                        className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-white">
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {createImages.length < MAX_IMAGES && (
                <>
                  <button type="button" onClick={() => createFileRef.current?.click()}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border/60 bg-muted/30 py-2.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-muted/50">
                    <ImagePlus className="h-3.5 w-3.5" />
                    Lägg till bild
                  </button>
                  <input ref={createFileRef} type="file" accept="image/*" multiple className="hidden"
                    onChange={(e) => addCreateImages(e.target.files, e.target)} />
                </>
              )}
            </div>
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

      {editTarget && (
        <Dialog open onOpenChange={(o) => { if (!o) { setEditTarget(null); editPreviews.forEach((p) => URL.revokeObjectURL(p)); setEditImages([]); setEditPreviews([]); setRequestImages([]); } }}>
          <DialogContent className="w-full max-w-md sm:max-w-md mx-0 sm:mx-auto">
            <DialogHeader>
              <DialogTitle>Hantera önskemål</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
                <p className="font-medium text-sm">{editTarget.product_name}</p>
                {editTarget.notes && (
                  <div className="mt-2 border-t border-border/40 pt-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70 mb-0.5">Kundens kommentar</p>
                    <p className="text-xs text-muted-foreground">{editTarget.notes}</p>
                  </div>
                )}
              </div>

              {/* Images */}
              <div className="space-y-2">
                <Label className="text-xs">Bilder</Label>
                {(requestImages.length > 0 || editPreviews.length > 0) && (
                  <div className="flex flex-wrap gap-2">
                    {requestImages.map((img) => (
                      <div key={img.id} className="relative h-16 w-16 overflow-hidden rounded-lg border border-border/60">
                        <img src={getPublicUrl(img.storage_path)} alt="" className="h-full w-full object-cover" />
                        <button type="button" onClick={() => deleteExistingImage(img.id)}
                          className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-white">
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    ))}
                    {editPreviews.map((src, i) => (
                      <div key={`new-${i}`} className="relative h-16 w-16 overflow-hidden rounded-lg border border-border/60 ring-1 ring-primary/40">
                        <img src={src} alt="" className="h-full w-full object-cover" />
                        <button type="button" onClick={() => removeEditImage(i)}
                          className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-white">
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {(requestImages.length + editImages.length) < MAX_IMAGES && (
                  <>
                    <button type="button" onClick={() => editFileRef.current?.click()}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border/60 bg-muted/30 py-2.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-muted/50">
                      <ImagePlus className="h-3.5 w-3.5" />
                      Lägg till bild
                    </button>
                    <input ref={editFileRef} type="file" accept="image/*" multiple className="hidden"
                      onChange={(e) => addEditImages(e.target.files, e.target)} />
                  </>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1.5">
                  <Hash className="h-3 w-3 text-muted-foreground" />
                  Materialnummer / EAN / BNR
                </Label>
                <div className="flex gap-2">
                  <Input
                    placeholder={editArticleType === "mat-nr" ? "T.ex. 1047133" : editArticleType === "ean" ? "T.ex. 7310865003294" : "T.ex. 123456"}
                    value={editArticleNumber}
                    onChange={(e) => setEditArticleNumber(e.target.value.replace(/\D/g, ""))}
                    onBlur={(e) => { if (e.target.value.trim()) handleArticleInput(e.target.value.trim(), "edit"); }}
                    inputMode="numeric"
                    className="font-mono text-sm"
                  />
                  <Select value={editArticleType} onValueChange={(v) => setEditArticleType(v as ArticleIdType)}>
                    <SelectTrigger className="w-28 shrink-0 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mat-nr">Mat-nr</SelectItem>
                      <SelectItem value="ean">EAN</SelectItem>
                      <SelectItem value="bnr">BNR</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-[11px] text-muted-foreground">Syns bara internt — används för direktlänk till Mitt Coop-sortiment.</p>
              </div>
              {/* Edit: category selector */}
              <div className="space-y-1.5">
                <Label className="text-xs">Kategori i Mitt Coop (valfritt)</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="Sök kategori..."
                    value={editCategorySearch}
                    onChange={(e) => setEditCategorySearch(e.target.value)}
                    className="pl-8 text-xs h-8"
                  />
                </div>
                {editCategoryId && (
                  <div className="flex items-center gap-1.5">
                    <Badge variant="secondary" className="text-xs font-mono">
                      {MITT_COOP_CATEGORIES.find(c => c.id === editCategoryId)?.label ?? editCategoryId}
                    </Badge>
                    <button type="button" onClick={() => setEditCategoryId(null)} className="text-muted-foreground hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
                {editCategorySearch && (
                  <div className="max-h-36 overflow-y-auto rounded-xl border border-border/60 bg-card shadow-sm">
                    {MITT_COOP_CATEGORIES.filter(c =>
                      c.label.toLowerCase().includes(editCategorySearch.toLowerCase()) ||
                      String(c.id).includes(editCategorySearch)
                    ).slice(0, 20).map(c => (
                      <button
                        key={c.id}
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted/50 transition-colors"
                        onClick={() => { setEditCategoryId(c.id); setEditCategorySearch(""); }}
                      >
                        <span className="font-mono text-muted-foreground">{c.id}</span>
                        <span>{c.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* Edit: status filter */}
              <div className="space-y-1.5">
                <Label className="text-xs">Statusfilter i Mitt Coop (valfritt)</Label>
                <Select
                  value={editStatusCode ? String(editStatusCode) : "none"}
                  onValueChange={(v) => setEditStatusCode(v === "none" ? null : Number(v))}
                >
                  <SelectTrigger className="text-xs h-8"><SelectValue placeholder="Välj status..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Inget filter</SelectItem>
                    {MITT_COOP_STATUS_CODES.map(s => (
                      <SelectItem key={s.code} value={String(s.code)}>{s.code.toString().padStart(2, "0")} — {s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                  value={editInternalNotes}
                  onChange={(e) => setEditInternalNotes(e.target.value)}
                  rows={2}
                  className="resize-none text-sm"
                  placeholder="Intern info, syns inte för kunden..."
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" className="rounded-full" onClick={() => { setEditTarget(null); editPreviews.forEach((p) => URL.revokeObjectURL(p)); setEditImages([]); setEditPreviews([]); setRequestImages([]); }}>Avbryt</Button>
              <Button className="rounded-full" disabled={saving} onClick={updateRequest}>
                {saving ? "Sparar..." : "Spara"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {detailTarget && (() => {
        const r = detailTarget;
        const store = stores.find((s) => s.id === r.store_id) ?? null;
        const mcUrl = mittCoopUrlFromStored(r.article_number, store?.sap_site_id ?? activeStore?.sap_site_id ?? null, { categoryId: r.mitt_coop_category_id ?? undefined, statusCode: r.mitt_coop_status_code ?? undefined });
        const staffComment = (r as CustomerRequest & { staff_comment?: string | null }).staff_comment;
        return (
          <Dialog open onOpenChange={(o) => { if (!o) { setDetailTarget(null); setRequestImages([]); } }}>
            <DialogContent className="w-full max-w-md sm:max-w-md mx-0 sm:mx-auto">
              <DialogHeader>
                <button
                  onClick={() => { setDetailTarget(null); setRequestImages([]); }}
                  className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted/60 transition-colors"
                  aria-label="Stäng"
                >
                  <X className="h-4 w-4" />
                </button>
                <DialogTitle className="text-base leading-tight">{r.product_name}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {/* Status + priority row */}
                <div className="flex items-center gap-2 flex-wrap">
                  {statusBadge(r.status)}
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", priorityClass(r.priority))}>
                    {PRIORITY_LABELS[r.priority]}
                  </span>
                  {r.source === "qr" && (
                    <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Via QR</span>
                  )}
                </div>

                {/* Article number — internal */}
                {r.article_number && (
                  <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70 mb-1">
                      {decodeArticleNumber(r.article_number)?.type === "ean" ? "EAN" : decodeArticleNumber(r.article_number)?.type === "bnr" ? "BNR" : "Materialnummer"}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm text-foreground">{decodeArticleNumber(r.article_number)?.value ?? r.article_number}</span>
                      {r.mitt_coop_category_id && (
                        <span className="text-[10px] text-muted-foreground">
                          {MITT_COOP_CATEGORIES.find(c => c.id === r.mitt_coop_category_id)?.label}
                        </span>
                      )}
                      {r.mitt_coop_status_code && (
                        <span className="text-[10px] text-muted-foreground">
                          {MITT_COOP_STATUS_CODES.find(s => s.code === r.mitt_coop_status_code)?.label}
                        </span>
                      )}
                      {mcUrl && (
                        <a href={mcUrl} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/20 transition-colors">
                          <ExternalLink className="h-3 w-3" />
                          Mitt Coop-sortiment
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {/* Customer notes */}
                {r.notes && (
                  <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70 mb-1">Kundens kommentar</p>
                    <p className="text-sm text-foreground">{r.notes}</p>
                  </div>
                )}

                {/* Images */}
                {requestImages.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">Bilder</p>
                    <div className="flex flex-wrap gap-2">
                      {requestImages.map((img) => (
                        <a key={img.id} href={getPublicUrl(img.storage_path)} target="_blank" rel="noopener noreferrer"
                          className="h-20 w-20 overflow-hidden rounded-xl border border-border/60 block">
                          <img src={getPublicUrl(img.storage_path)} alt="" className="h-full w-full object-cover" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Staff message to customer */}
                {staffComment && (
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-primary/70 mb-1">Meddelande till kund</p>
                    <p className="text-sm text-foreground">{staffComment}</p>
                  </div>
                )}

                {/* Internal notes */}
                {r.internal_notes && (
                  <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70 mb-1">Intern anteckning</p>
                    <p className="text-sm text-foreground">{r.internal_notes}</p>
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  {r.requester?.display_name && <>{r.requester.display_name} · </>}
                  {new Date(r.created_at).toLocaleDateString("sv-SE", { year: "numeric", month: "long", day: "numeric" })}
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                {isManager && (
                  <Button className="rounded-full" onClick={() => {
                    setDetailTarget(null);
                    setEditTarget(r);
                    setEditStatus(r.status);
                    const decoded2 = decodeArticleNumber(r.article_number);
                    setEditArticleNumber(decoded2?.value ?? "");
                    setEditArticleType(decoded2?.type ?? "mat-nr");
                    setEditCategoryId(r.mitt_coop_category_id ?? null);
                    setEditStatusCode(r.mitt_coop_status_code ?? null);
                    setEditCategorySearch("");
                    setEditInternalNotes(r.internal_notes ?? "");
                    setEditComment((r as CustomerRequest & { staff_comment?: string }).staff_comment ?? "");
                  }}>
                    Hantera
                  </Button>
                )}
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}

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

      {/* 3-way article number disambiguation */}
      <AlertDialog open={!!articlePrompt} onOpenChange={(o) => { if (!o) setArticlePrompt(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vad är <span className="font-mono">{articlePrompt?.value}</span>?</AlertDialogTitle>
            <AlertDialogDescription>
              Välj vilken typ av nummer du angett — det avgör vilken länk som genereras i Mitt Coop-sortiment.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            {(["mat-nr", "ean", "bnr"] as ArticleIdType[]).map((t) => (
              <AlertDialogAction
                key={t}
                onClick={() => {
                  if (articlePrompt) {
                    if (articlePrompt.target === "create") {
                      setForm(p => ({ ...p, article_number: articlePrompt.value, article_type: t }));
                    } else {
                      setEditArticleNumber(articlePrompt.value);
                      setEditArticleType(t);
                    }
                  }
                  setArticlePrompt(null);
                }}
                className={t === "mat-nr" ? "" : t === "ean" ? "bg-info/90 hover:bg-info" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"}
              >
                {t === "mat-nr" ? "Materialnummer" : t === "ean" ? "EAN-streckkod" : "BNR (Beställningsnr)"}
              </AlertDialogAction>
            ))}
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
                    <QrDisplay url={`${window.location.origin}/qr-kundonskemal-form?t=${storeQrToken}`} size={200} />
                  </div>
                  <div className="rounded-xl border border-border/60 bg-muted/20 p-2.5">
                    <p className="break-all font-mono text-[10px] text-muted-foreground leading-relaxed">
                      {`${window.location.origin}/qr-kundonskemal-form?t=${storeQrToken}`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 rounded-full"
                      onClick={() => {
                        const url = `${window.location.origin}/qr-kundonskemal-form?t=${storeQrToken}`;
                        navigator.clipboard?.writeText(url).catch(() => {});
                        setCopiedQr(true);
                        setTimeout(() => setCopiedQr(false), 2000);
                      }}
                    >
                      <Copy className="mr-1.5 h-3.5 w-3.5" />
                      {copiedQr ? "Kopierat!" : "Kopiera länk"}
                    </Button>
                    <a
                      href={`${window.location.origin}/qr-kundonskemal-form?t=${storeQrToken}`}
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
