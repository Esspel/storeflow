import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Copy,
  ExternalLink,
  Hash,
  ImagePlus,
  Link as LinkIcon,
  Plus,
  QrCode,
  ScanLine,
  Search,
  ShoppingCart,
  Store as StoreIcon,
  Trash2,
  X,
} from "lucide-react";
import { CameraScanner } from "@/components/camera-scanner";
import { QrDisplay } from "@/components/qr-display";
import { PageHeader, StatCard } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  supabase,
  type CustomerRequest,
  type Store as StoreType,
  mittCoopUrlFromStored,
  decodeArticleNumber,
  encodeArticleNumber,
  parseMittCoopUrl,
  type ArticleIdType,
  getPublicUrl,
  uploadAttachment,
  deleteStorageFiles,
} from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/kundonskemal")({
  component: CustomerRequestsPage,
});

const STATUS_LABELS: Record<string, string> = {
  open: "Inkommit",
  ordered: "Beställd",
  fulfilled: "Uppfylld",
  declined: "Avböjd",
  not_in_assortment: "Finns ej i sortiment",
  discontinued: "Utgått",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Låg",
  normal: "Normal",
  high: "Hög",
};

function statusBadge(s: string) {
  if (s === "ordered") return <Badge className="bg-info/15 text-info">Beställd</Badge>;
  if (s === "fulfilled") return <Badge className="bg-success/15 text-success">Uppfylld</Badge>;
  if (s === "declined")
    return (
      <Badge variant="secondary" className="text-coop-gray-600">
        Avböjd
      </Badge>
    );
  if (s === "not_in_assortment")
    return (
      <Badge variant="secondary" className="text-coop-gray-600">
        Finns ej i sortiment
      </Badge>
    );
  if (s === "discontinued")
    return (
      <Badge variant="secondary" className="text-coop-gray-600">
        Utgått
      </Badge>
    );
  return <Badge variant="secondary">Inkommit</Badge>;
}

function priorityClass(p: string) {
  if (p === "high") return "bg-destructive/10 text-destructive";
  if (p === "low") return "bg-muted text-coop-gray-600";
  return "bg-info/15 text-info";
}

const emptyForm = () => ({
  product_name: "",
  article_number: "",
  article_type: "mat-nr" as ArticleIdType,
  notes: "",
  priority: "normal" as "low" | "normal" | "high",
});

function CustomerRequestsPage() {
  const { user, activeStore, userStores } = useAuth();
  const isAdmin = user?.role === "admin";
  const isManager = user?.role === "manager" || isAdmin;

  const [requests, setRequests] = useState<CustomerRequest[]>([]);
  const [requestImagesMap, setRequestImagesMap] = useState<
    Record<string, { id: string; storage_path: string }[]>
  >({});
  const [stores, setStores] = useState<StoreType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("active");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [articleCameraOpen, setArticleCameraOpen] = useState(false);
  const [mcUrlInput, setMcUrlInput] = useState("");
  const [editMcUrlInput, setEditMcUrlInput] = useState("");
  const [mcUrlSuccess, setMcUrlSuccess] = useState(false);
  const [editMcUrlSuccess, setEditMcUrlSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CustomerRequest | null>(null);
  const [editTarget, setEditTarget] = useState<CustomerRequest | null>(null);
  const [editStatus, setEditStatus] = useState<CustomerRequest["status"]>("open");
  const [editInternalNotes, setEditInternalNotes] = useState("");
  const [editArticleNumber, setEditArticleNumber] = useState("");
  const [editArticleType, setEditArticleType] = useState<ArticleIdType>("mat-nr");
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrRequest, setQrRequest] = useState<CustomerRequest | null>(null);
  const [qrTokenUrl, setQrTokenUrl] = useState("");
  const [showStoreQrModal, setShowStoreQrModal] = useState(false);
  const [storeQrToken, setStoreQrToken] = useState("");
  const [storeQrLoading, setStoreQrLoading] = useState(false);
  const [copiedQr, setCopiedQr] = useState(false);
  const [editComment, setEditComment] = useState("");

  const handlePasteMcUrl = (input: string, target: "create" | "edit") => {
    const parsed = parseMittCoopUrl(input);
    if (parsed) {
      if (target === "create") {
        setForm((prev) => ({
          ...prev,
          ...(parsed.product_name ? { product_name: parsed.product_name } : {}),
          ...(parsed.article_number ? { article_number: parsed.article_number } : {}),
          ...(parsed.article_type ? { article_type: parsed.article_type } : {}),
        }));
        setMcUrlInput("");
        setMcUrlSuccess(true);
        setTimeout(() => setMcUrlSuccess(false), 3500);
      } else {
        if (parsed.article_number) setEditArticleNumber(parsed.article_number);
        if (parsed.article_type) setEditArticleType(parsed.article_type);
        setEditMcUrlInput("");
        setEditMcUrlSuccess(true);
        setTimeout(() => setEditMcUrlSuccess(false), 3500);
      }
    }
  };

  // Image upload for create/edit
  const [createImages, setCreateImages] = useState<File[]>([]);
  const [createPreviews, setCreatePreviews] = useState<string[]>([]);
  const createFileRef = useRef<HTMLInputElement>(null);
  const [editImages, setEditImages] = useState<File[]>([]);
  const [editPreviews, setEditPreviews] = useState<string[]>([]);
  const editFileRef = useRef<HTMLInputElement>(null);
  const [currentEditImages, setCurrentEditImages] = useState<
    { id: string; storage_path: string }[]
  >([]);

  const MAX_IMAGES = 5;

  const loadAllImages = async (requestIds: string[]) => {
    if (requestIds.length === 0) {
      setRequestImagesMap({});
      return;
    }
    const { data } = await supabase
      .from("customer_request_images")
      .select("id, request_id, storage_path")
      .in("request_id", requestIds)
      .order("created_at");

    if (data) {
      const map: Record<string, { id: string; storage_path: string }[]> = {};
      data.forEach((img) => {
        if (!map[img.request_id]) map[img.request_id] = [];
        map[img.request_id].push({ id: img.id, storage_path: img.storage_path });
      });
      setRequestImagesMap(map);
    }
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
    const remaining = MAX_IMAGES - (currentEditImages.length + editImages.length);
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
    const img = currentEditImages.find((i) => i.id === imgId);
    await supabase.from("customer_request_images").delete().eq("id", imgId);
    if (img) deleteStorageFiles([img.storage_path]);
    setCurrentEditImages((prev) => prev.filter((i) => i.id !== imgId));
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

  useEffect(() => {
    if (editTarget) {
      setCurrentEditImages(requestImagesMap[editTarget.id] || []);
    } else {
      setCurrentEditImages([]);
    }
  }, [editTarget]);

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
      const { data: created } = await supabase
        .from("qr_tokens")
        .insert({
          token_type: "customer_request_status",
          store_id: activeStore.id,
          meta: { request_id: req.id },
          created_by: user.id,
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .select("token")
        .maybeSingle();
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
      const { data: created } = await supabase
        .from("qr_tokens")
        .insert({
          token_type: "customer_request_form",
          store_id: activeStore.id,
          meta: {},
          created_by: user.id,
        })
        .select("token")
        .maybeSingle();
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
      q = q.in(
        "store_id",
        userStores.map((s) => s.id),
      );
    }
    const { data } = await q;
    if (data) {
      const fetchedRequests = data as CustomerRequest[];
      setRequests(fetchedRequests);
      await loadAllImages(fetchedRequests.map((r) => r.id));
    }
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    fetchRequests();
    if (isAdmin) {
      supabase
        .from("stores")
        .select("*")
        .eq("is_active", true)
        .then(({ data }) => {
          if (data) setStores(data as StoreType[]);
        });
    }
  }, [activeStore, user]);

  const createRequest = async () => {
    if (!form.product_name.trim()) return;
    setSaving(true);
    const storedArticle = form.article_number.trim()
      ? encodeArticleNumber(form.article_number.trim(), form.article_type)
      : null;
    const { data: inserted } = await supabase
      .from("customer_requests")
      .insert({
        store_id: activeStore?.id,
        product_name: form.product_name.trim(),
        article_number: storedArticle,
        notes: form.notes.trim() || null,
        priority: form.priority,
        requested_by: user?.id,
      })
      .select("id")
      .maybeSingle();
    if (inserted?.id && createImages.length > 0) {
      await uploadImages(inserted.id, createImages);
    }
    setSaving(false);
    setShowCreate(false);
    setForm(emptyForm());
    setMcUrlInput("");
    createPreviews.forEach((p) => URL.revokeObjectURL(p));
    setCreateImages([]);
    setCreatePreviews([]);
    await fetchRequests();
  };

  const updateRequest = async () => {
    if (!editTarget) return;
    if (editStatus === "declined" && !editComment.trim()) return;

    setSaving(true);
    const storedArticle = editArticleNumber.trim()
      ? encodeArticleNumber(editArticleNumber.trim(), editArticleType)
      : null;
    await supabase
      .from("customer_requests")
      .update({
        status: editStatus,
        article_number: storedArticle,
        internal_notes: editInternalNotes.trim() || null,
        staff_comment: editComment.trim() || null,
      })
      .eq("id", editTarget.id);
    if (editImages.length > 0) {
      await uploadImages(editTarget.id, editImages);
    }
    setSaving(false);
    editPreviews.forEach((p) => URL.revokeObjectURL(p));
    setEditImages([]);
    setEditPreviews([]);
    setCurrentEditImages([]);
    setEditTarget(null);
    setEditMcUrlInput("");
    await fetchRequests();
  };

  const deleteRequest = async () => {
    if (!deleteTarget) return;
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

  const buildMcUrl = (
    articleNumber: string | null | undefined,
    storeSapSiteId: string | null | undefined,
  ): string | null => mittCoopUrlFromStored(articleNumber, storeSapSiteId);

  const filtered = requests.filter((r) => {
    if (
      filterStatus === "active" &&
      (r.status === "fulfilled" ||
        r.status === "declined" ||
        r.status === "not_in_assortment" ||
        r.status === "discontinued")
    )
      return false;
    if (filterStatus !== "active" && filterStatus !== "all" && r.status !== filterStatus)
      return false;
    if (
      search &&
      !r.product_name.toLowerCase().includes(search.toLowerCase()) &&
      !(r.article_number ?? "").toLowerCase().includes(search.toLowerCase())
    )
      return false;
    return true;
  });

  const open = requests.filter((r) => r.status === "open").length;
  const ordered = requests.filter((r) => r.status === "ordered").length;
  const fulfilled = requests.filter((r) => r.status === "fulfilled").length;

  return (
    <div className="mx-auto max-w-[1200px] px-5 py-8 md:px-8 md:py-10">
      <PageHeader
        title="Kundönskemål"
        description={
          activeStore
            ? `Önskemål från kunder i ${activeStore.name}`
            : "Produktönskemål från kunder."
        }
        actions={
          <div className="flex gap-2">
            {isManager && activeStore && (
              <Button
                variant="outline"
                className="rounded-full hidden lg:flex gap-1.5"
                onClick={openStoreQr}
              >
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
              { value: "not_in_assortment", label: "Finns ej i sortiment" },
              { value: "discontinued", label: "Utgått" },
            ].map((f) => (
              <button
                key={f.value}
                onClick={() => setFilterStatus(f.value)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap",
                  filterStatus === f.value
                    ? "bg-coop-gray-100 text-coop-gray-900 shadow-sm"
                    : "text-coop-gray-600 hover:text-coop-gray-900",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-coop-gray-600" />
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
            <div key={i} className="rounded-2xl border border-border/60 bg-coop-gray-100 p-4 space-y-3">
              <div className="h-4 w-3/4 animate-pulse rounded-md bg-muted" />
              <div className="h-3 w-1/2 animate-pulse rounded-md bg-muted/60" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-coop-gray-100 py-16 text-center">
          <ShoppingCart className="mb-3 h-10 w-10 text-coop-gray-600/40" />
          <p className="text-sm font-medium text-coop-gray-600">Inga kundönskemål hittades</p>
          <Button className="mt-4 rounded-full" size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Registrera önskemål
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((r) => {
            const store = stores.find((s) => s.id === r.store_id) ?? null;
            const mcUrl = buildMcUrl(
              r.article_number,
              store?.sap_site_id ?? activeStore?.sap_site_id ?? null,
            );
            const decodedArticle = decodeArticleNumber(r.article_number);
            const images = requestImagesMap[r.id] || [];
            const staffComment = (r as CustomerRequest & { staff_comment?: string | null })
              .staff_comment;

            return (
              <div
                key={r.id}
                className="flex flex-col justify-between rounded-2xl border border-border/60 bg-coop-gray-100 p-4 space-y-3 shadow-sm hover:border-border transition-colors"
              >
                <div className="space-y-3">
                  {/* Top bar: Name + badges */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-base leading-snug">{r.product_name}</p>
                      {r.source === "qr" && (
                        <span className="inline-block mt-1 rounded-full border border-border/60 px-2 py-0.5 text-[10px] font-medium text-coop-gray-600">
                          Via QR
                        </span>
                      )}
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1.5">
                      {statusBadge(r.status)}
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-medium",
                          priorityClass(r.priority),
                        )}
                      >
                        {PRIORITY_LABELS[r.priority]}
                      </span>
                    </div>
                  </div>

                  {/* Article number & Mitt Coop info */}
                  {r.article_number && (
                    <div className="rounded-xl border border-border/60 bg-muted/30 p-2.5 space-y-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-coop-gray-600/70">
                        {decodedArticle?.type === "ean"
                          ? "EAN"
                          : decodedArticle?.type === "bnr"
                            ? "BNR"
                            : "Materialnummer"}
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-semibold text-coop-gray-900">
                          {decodedArticle?.value ?? r.article_number}
                        </span>
                        {mcUrl && (
                          <a
                            href={mcUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/20 transition-colors"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Mitt Coop
                          </a>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Customer notes */}
                  {r.notes && (
                    <div className="rounded-xl bg-muted/50 px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-600/90 dark:text-amber-400/90 mb-0.5">
                        Anteckning (visas för kunden)
                      </p>
                      <p className="text-xs text-coop-gray-600 leading-relaxed">{r.notes}</p>
                    </div>
                  )}

                  {/* Staff Comment */}
                  {staffComment && (
                    <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-primary/70 mb-0.5">
                        Meddelande till kund
                      </p>
                      <p className="text-xs text-coop-gray-900 leading-relaxed">{staffComment}</p>
                    </div>
                  )}

                  {/* Internal Notes */}
                  {r.internal_notes && (
                    <div className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-coop-gray-600/70 mb-0.5">
                        Intern anteckning
                      </p>
                      <p className="text-xs text-coop-gray-600 leading-relaxed">
                        {r.internal_notes}
                      </p>
                    </div>
                  )}

                  {/* Images */}
                  {images.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-coop-gray-600/70">
                        Bilder
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {images.map((img) => (
                          <a
                            key={img.id}
                            href={getPublicUrl(img.storage_path)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="h-14 w-14 overflow-hidden rounded-lg border border-border/60 block hover:opacity-90 transition-opacity"
                          >
                            <img
                              src={getPublicUrl(img.storage_path)}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer: Meta & actions */}
                <div className="pt-2 border-t border-border/40 space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-coop-gray-600/70">
                    <span>{r.requester?.display_name ?? "Anonym/Kund"}</span>
                    <span>{new Date(r.created_at).toLocaleDateString("sv-SE")}</span>
                  </div>

                  <div className="flex items-center justify-between gap-1 pt-1">
                    {isManager ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-full px-3 text-xs"
                        onClick={() => {
                          const decoded = decodeArticleNumber(r.article_number);
                          setEditTarget(r);
                          setEditStatus(r.status);
                          setEditArticleNumber(decoded?.value ?? "");
                          setEditArticleType(decoded?.type ?? "mat-nr");
                          setEditInternalNotes(r.internal_notes ?? "");
                          setEditComment(
                            (r as CustomerRequest & { staff_comment?: string }).staff_comment ?? "",
                          );
                          setEditMcUrlInput("");
                        }}
                      >
                        Hantera
                      </Button>
                    ) : (
                      <div />
                    )}

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openQrForRequest(r)}
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-border/60 text-coop-gray-600 hover:bg-muted/60 hover:text-primary transition-colors"
                        title="Dela status-QR med kund"
                      >
                        <QrCode className="h-4 w-4" />
                      </button>
                      {isManager && (
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(r)}
                          className="flex h-8 w-8 items-center justify-center rounded-full border border-border/60 text-coop-gray-600 hover:bg-muted/60 hover:text-destructive transition-colors"
                          title="Ta bort önskemål"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create dialog */}
      <Dialog
        open={showCreate}
        onOpenChange={(o) => {
          setShowCreate(o);
          if (!o) {
            setForm(emptyForm());
            setMcUrlInput("");
            createPreviews.forEach((p) => URL.revokeObjectURL(p));
            setCreateImages([]);
            setCreatePreviews([]);
          }
        }}
      >
        <DialogContent className="w-full max-w-md sm:max-w-md mx-0 sm:mx-auto">
          <DialogHeader>
            <DialogTitle>Registrera kundönskemål</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Mitt Coop URL Paste Section */}
            <div className="space-y-1.5 rounded-xl border border-primary/20 bg-primary/5 p-3">
              <Label className="text-xs font-semibold text-primary flex items-center gap-1.5">
                <LinkIcon className="h-3.5 w-3.5 text-primary" />
                Klistra in Mitt Coop-sortiment URL
              </Label>
              <Input
                placeholder="https://mittcoop.coop.se/sortiment/..."
                value={mcUrlInput}
                onChange={(e) => {
                  setMcUrlInput(e.target.value);
                  handlePasteMcUrl(e.target.value, "create");
                }}
                className="text-xs bg-background"
              />
              {mcUrlSuccess ? (
                <p className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                  ✓ Fälten har fyllts i automatiskt från länken!
                </p>
              ) : (
                <p className="text-[11px] text-coop-gray-600">
                  Fyller automatiskt i artikelnummer, typ och produktnamn från länken.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Produktnamn *</Label>
              <Input
                placeholder="T.ex. Oatly iKaffe 1L..."
                value={form.product_name}
                onChange={(e) => {
                  const val = e.target.value;
                  if (
                    val.includes("mittcoop") ||
                    val.startsWith("http://") ||
                    val.startsWith("https://")
                  ) {
                    handlePasteMcUrl(val, "create");
                  } else {
                    setForm((p) => ({ ...p, product_name: val }));
                  }
                }}
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                <Hash className="h-3 w-3 text-coop-gray-600" />
                Materialnummer / EAN / BNR (valfritt)
              </Label>
              <div className="flex gap-2">
                <Input
                  placeholder={
                    form.article_type === "mat-nr"
                      ? "T.ex. 1047133"
                      : form.article_type === "ean"
                        ? "T.ex. 7310865003294"
                        : "T.ex. 123456"
                  }
                  value={form.article_number}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (
                      val.includes("mittcoop") ||
                      val.startsWith("http://") ||
                      val.startsWith("https://")
                    ) {
                      handlePasteMcUrl(val, "create");
                    } else {
                      setForm((p) => ({ ...p, article_number: val.replace(/\D/g, "") }));
                    }
                  }}
                  inputMode="numeric"
                  className="font-mono text-sm"
                />
                <Select
                  value={form.article_type}
                  onValueChange={(v) =>
                    setForm((p) => ({ ...p, article_type: v as ArticleIdType }))
                  }
                >
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
                  className="flex items-center gap-1 shrink-0 rounded-xl border border-border/60 px-2.5 py-1 text-[11px] text-coop-gray-600 transition-colors hover:border-primary/50 hover:text-primary"
                  title="Scanna EAN-streckkod"
                >
                  <ScanLine className="h-3 w-3" />
                  Scanna
                </button>
              </div>
              <p className="text-[11px] text-coop-gray-600">
                Används för direktlänk till Mitt Coop-sortiment. Ange typ av nummer i rullgardinen.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Prioritet</Label>
              <Select
                value={form.priority}
                onValueChange={(v) => setForm((p) => ({ ...p, priority: v as typeof p.priority }))}
              >
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
                <Label className="text-xs font-medium">Anteckning (valfritt)</Label>
                <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                  Visas på kundens sida
                </span>
              </div>
              <Textarea
                placeholder="Skriv anteckning (observera att detta visas på kundens sida)..."
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                rows={3}
                className="resize-none text-sm"
              />
              <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                Obs: Det du skriver här kommer att visas för kunden på deras statuslänk.
              </p>
            </div>

            {articleCameraOpen && (
              <CameraScanner
                onScan={(code) => {
                  setArticleCameraOpen(false);
                  setForm((p) => ({
                    ...p,
                    article_number: code.replace(/\D/g, ""),
                    article_type: "ean",
                  }));
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
                    <div
                      key={i}
                      className="relative h-16 w-16 overflow-hidden rounded-lg border border-border/60"
                    >
                      <img src={src} alt="" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeCreateImage(i)}
                        className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-coop-svart/60 text-coop-vit"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {createImages.length < MAX_IMAGES && (
                <>
                  <button
                    type="button"
                    onClick={() => createFileRef.current?.click()}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border/60 bg-muted/30 py-2.5 text-xs text-coop-gray-600 transition-colors hover:border-primary/40 hover:bg-muted/50"
                  >
                    <ImagePlus className="h-3.5 w-3.5" />
                    Lägg till bild
                  </button>
                  <input
                    ref={createFileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => addCreateImages(e.target.files, e.target)}
                  />
                </>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" className="rounded-full" onClick={() => setShowCreate(false)}>
              Avbryt
            </Button>
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

      {/* Edit Dialog */}
      {editTarget && (
        <Dialog
          open
          onOpenChange={(o) => {
            if (!o) {
              setEditTarget(null);
              setEditMcUrlInput("");
              editPreviews.forEach((p) => URL.revokeObjectURL(p));
              setEditImages([]);
              setEditPreviews([]);
              setCurrentEditImages([]);
            }
          }}
        >
          <DialogContent className="w-full max-w-md sm:max-w-md mx-0 sm:mx-auto">
            <DialogHeader>
              <DialogTitle>Hantera önskemål</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
                <p className="font-medium text-sm">{editTarget.product_name}</p>
                {editTarget.notes && (
                  <div className="mt-2 border-t border-border/40 pt-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-600/90 dark:text-amber-400/90 mb-0.5">
                      Anteckning (visas för kunden)
                    </p>
                    <p className="text-xs text-coop-gray-600">{editTarget.notes}</p>
                  </div>
                )}
              </div>

              {/* Mitt Coop URL Paste Section in Edit */}
              <div className="space-y-1.5 rounded-xl border border-primary/20 bg-primary/5 p-3">
                <Label className="text-xs font-semibold text-primary flex items-center gap-1.5">
                  <LinkIcon className="h-3.5 w-3.5 text-primary" />
                  Klistra in Mitt Coop-sortiment URL
                </Label>
                <Input
                  placeholder="https://mittcoop.coop.se/sortiment/..."
                  value={editMcUrlInput}
                  onChange={(e) => {
                    setEditMcUrlInput(e.target.value);
                    handlePasteMcUrl(e.target.value, "edit");
                  }}
                  className="text-xs bg-background"
                />
                {editMcUrlSuccess ? (
                  <p className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                    ✓ Artikelnummer har fyllts i från länken!
                  </p>
                ) : (
                  <p className="text-[11px] text-coop-gray-600">
                    Fyller automatiskt i artikelnummer och typ från länken.
                  </p>
                )}
              </div>

              {/* Images */}
              <div className="space-y-2">
                <Label className="text-xs">Bilder</Label>
                {(currentEditImages.length > 0 || editPreviews.length > 0) && (
                  <div className="flex flex-wrap gap-2">
                    {currentEditImages.map((img) => (
                      <div
                        key={img.id}
                        className="relative h-16 w-16 overflow-hidden rounded-lg border border-border/60"
                      >
                        <img
                          src={getPublicUrl(img.storage_path)}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => deleteExistingImage(img.id)}
                          className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-coop-svart/60 text-coop-vit"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    ))}
                    {editPreviews.map((src, i) => (
                      <div
                        key={`new-${i}`}
                        className="relative h-16 w-16 overflow-hidden rounded-lg border border-border/60 ring-1 ring-primary/40"
                      >
                        <img src={src} alt="" className="h-full w-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removeEditImage(i)}
                          className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-coop-svart/60 text-coop-vit"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {currentEditImages.length + editImages.length < MAX_IMAGES && (
                  <>
                    <button
                      type="button"
                      onClick={() => editFileRef.current?.click()}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border/60 bg-muted/30 py-2.5 text-xs text-coop-gray-600 transition-colors hover:border-primary/40 hover:bg-muted/50"
                    >
                      <ImagePlus className="h-3.5 w-3.5" />
                      Lägg till bild
                    </button>
                    <input
                      ref={editFileRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => addEditImages(e.target.files, e.target)}
                    />
                  </>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1.5">
                  <Hash className="h-3 w-3 text-coop-gray-600" />
                  Materialnummer / EAN / BNR
                </Label>
                <div className="flex gap-2">
                  <Input
                    placeholder={
                      editArticleType === "mat-nr"
                        ? "T.ex. 1047133"
                        : editArticleType === "ean"
                          ? "T.ex. 7310865003294"
                          : "T.ex. 123456"
                    }
                    value={editArticleNumber}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (
                        val.includes("mittcoop") ||
                        val.startsWith("http://") ||
                        val.startsWith("https://")
                      ) {
                        handlePasteMcUrl(val, "edit");
                      } else {
                        setEditArticleNumber(val.replace(/\D/g, ""));
                      }
                    }}
                    inputMode="numeric"
                    className="font-mono text-sm"
                  />
                  <Select
                    value={editArticleType}
                    onValueChange={(v) => setEditArticleType(v as ArticleIdType)}
                  >
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
                <p className="text-[11px] text-coop-gray-600">
                  Syns bara internt — används för direktlänk till Mitt Coop-sortiment.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <Select
                  value={editStatus}
                  onValueChange={(v) => setEditStatus(v as typeof editStatus)}
                >
                  <SelectTrigger className="text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">
                  Meddelande till kund (visas på statuslänk){" "}
                  {editStatus === "declined" && <span className="text-destructive">*</span>}
                </Label>
                <Textarea
                  value={editComment}
                  onChange={(e) => setEditComment(e.target.value)}
                  rows={2}
                  className="resize-none text-sm"
                  placeholder="T.ex. Varan är nu i hylla 3, kyl..."
                />
                <p className="text-[11px] text-coop-gray-600">
                  {editStatus === "declined"
                    ? "En kommentar måste anges när önskemålet avböjs."
                    : "Kunden ser detta meddelande på sin statuslänk."}
                </p>
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
              <Button
                variant="outline"
                className="rounded-full"
                onClick={() => {
                  setEditTarget(null);
                  setEditMcUrlInput("");
                  editPreviews.forEach((p) => URL.revokeObjectURL(p));
                  setEditImages([]);
                  setEditPreviews([]);
                  setCurrentEditImages([]);
                }}
              >
                Avbryt
              </Button>
              <Button
                className="rounded-full"
                disabled={saving || (editStatus === "declined" && !editComment.trim())}
                onClick={updateRequest}
              >
                {saving ? "Sparar..." : "Spara"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete confirm */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
      >
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
        <Dialog
          open
          onOpenChange={(o) => {
            if (!o) {
              setShowQrModal(false);
              setQrRequest(null);
              setQrTokenUrl("");
              setCopiedQr(false);
            }
          }}
        >
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                  <QrCode className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <DialogTitle className="text-base">Dela status med kund</DialogTitle>
                  <p className="text-xs text-coop-gray-600">
                    Kunden kan följa önskemålets status via denna QR-kod.
                  </p>
                </div>
              </div>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
                <p className="text-xs text-coop-gray-600 mb-0.5">Produkt</p>
                <p className="font-medium text-sm text-coop-gray-900">{qrRequest.product_name}</p>
              </div>
              {qrTokenUrl ? (
                <div className="space-y-3">
                  <div className="flex justify-center rounded-2xl border border-border/60 bg-coop-vit p-4">
                    <QrDisplay url={qrTokenUrl} size={180} />
                  </div>
                  <div className="rounded-xl border border-border/60 bg-muted/20 p-2.5">
                    <p className="break-all font-mono text-[10px] text-coop-gray-600 leading-relaxed">
                      {qrTokenUrl}
                    </p>
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
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-border/60 bg-background px-3 py-2 text-xs font-medium text-coop-gray-900 hover:bg-muted transition-colors"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Öppna
                    </a>
                  </div>
                  <p className="text-xs text-center text-coop-gray-600">
                    Länken är giltig i 30 dagar.
                  </p>
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
        <Dialog
          open
          onOpenChange={(o) => {
            if (!o) {
              setShowStoreQrModal(false);
              setStoreQrToken("");
              setCopiedQr(false);
            }
          }}
        >
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                  <StoreIcon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <DialogTitle className="text-base">Butiks-QR för kundönskemål</DialogTitle>
                  <p className="text-xs text-coop-gray-600">
                    Kunder kan skanna och skicka in önskemål direkt.
                  </p>
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
                  <div className="flex justify-center rounded-2xl border border-border/60 bg-coop-vit p-4">
                    <QrDisplay
                      url={`${window.location.origin}/qr-kundonskemal-form?t=${storeQrToken}`}
                      size={200}
                    />
                  </div>
                  <div className="rounded-xl border border-border/60 bg-muted/20 p-2.5">
                    <p className="break-all font-mono text-[10px] text-coop-gray-600 leading-relaxed">
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
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-border/60 bg-background px-3 py-2 text-xs font-medium text-coop-gray-900 hover:bg-muted transition-colors"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Testa
                    </a>
                  </div>
                  <p className="text-xs text-center text-coop-gray-600">
                    Skriv ut och sätt upp i butiken. Kunder skannar och skickar önskemål direkt.
                  </p>
                </>
              ) : (
                <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 py-8 text-center">
                  <p className="text-sm text-coop-gray-600">Kunde inte generera QR-kod</p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
