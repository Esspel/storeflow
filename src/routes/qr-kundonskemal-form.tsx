import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  TriangleAlert as AlertTriangle,
  CircleCheck as CheckCircle2,
  ImagePlus,
  ShoppingCart,
  X,
} from "lucide-react";
import { supabase, compressImage } from "@/lib/supabase";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const searchSchema = z.object({
  t: z.string().optional(),
  token: z.string().optional(),
});

export const Route = createFileRoute("/qr-kundonskemal-form")({
  validateSearch: searchSchema,
  ssr: false,
  component: QrKundonskemalFormPage,
});

const MAX_IMAGES = 3;

function QrKundonskemalFormPage() {
  const search = useSearch({ from: "/qr-kundonskemal-form" });
  const token = search.t ?? search.token;

  const [resolving, setResolving] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [storeName, setStoreName] = useState("");

  const [form, setForm] = useState({
    product_name: "",
    notes: "",
    priority: "normal" as "low" | "normal" | "high",
  });
  const [images, setImages] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [statusUrl, setStatusUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!token) {
      setInvalid(true);
      setResolving(false);
      return;
    }

    supabase
      .from("qr_tokens")
      .select("*, store:stores(id,name)")
      .eq("token", token)
      .eq("token_type", "customer_request_form")
      .maybeSingle()
      .then(({ data }) => {
        if (!data) {
          setInvalid(true);
          setResolving(false);
          return;
        }
        const store = data.store as { id: string; name: string } | null;
        if (!store) {
          setInvalid(true);
          setResolving(false);
          return;
        }
        setStoreId(store.id);
        setStoreName(store.name);
        setResolving(false);
      });
  }, [token]);

  const addImages = async (files: FileList | null, inputEl?: HTMLInputElement | null) => {
    if (!files || files.length === 0) return;
    const remaining = MAX_IMAGES - images.length;
    const toAdd = Array.from(files).slice(0, remaining);
    // Reset input so the same file can be picked again
    if (inputEl) inputEl.value = "";
    const compressed = await Promise.all(toAdd.map((f) => compressImage(f)));
    const newPreviews = compressed.map((f) => URL.createObjectURL(f));
    setImages((prev) => [...prev, ...compressed]);
    setPreviews((prev) => [...prev, ...newPreviews]);
  };

  const removeImage = (i: number) => {
    URL.revokeObjectURL(previews[i]);
    setImages((prev) => prev.filter((_, idx) => idx !== i));
    setPreviews((prev) => prev.filter((_, idx) => idx !== i));
  };

  const submit = async () => {
    if (!form.product_name.trim() || !storeId) return;
    setSaving(true);

    const { data: inserted, error } = await supabase
      .from("customer_requests")
      .insert({
        store_id: storeId,
        product_name: form.product_name.trim(),
        notes: form.notes.trim() || null,
        priority: form.priority,
        source: "qr",
      })
      .select("id")
      .maybeSingle();

    if (!error && inserted?.id) {
      // Upload images
      for (const img of images) {
        const compressed = await compressImage(img);
        const path = `customer-requests/${inserted.id}/${crypto.randomUUID()}.jpg`;
        const { error: uploadErr } = await supabase.storage
          .from("attachments")
          .upload(path, compressed);
        if (!uploadErr) {
          await supabase.from("customer_request_images").insert({
            request_id: inserted.id,
            storage_path: path,
            uploaded_by: null,
          });
        }
      }

      // Create a status token so the customer can follow their request
      const { data: tokenRow } = await supabase
        .from("qr_tokens")
        .insert({
          token_type: "customer_request_status",
          store_id: storeId,
          meta: { request_id: inserted.id },
        })
        .select("token")
        .maybeSingle();
      if (tokenRow?.token) {
        setStatusUrl(`${window.location.origin}/qr-kundonskemal?t=${tokenRow.token}`);
      }
    }

    setSaving(false);
    setDone(true);
  };

  if (resolving) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (invalid) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="text-xl font-semibold text-coop-gray-900">Ogiltig QR-kod</h1>
          <p className="mt-2 text-sm text-coop-gray-600">
            Den här QR-koden är inte längre giltig eller har tagits bort.
          </p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-success/10">
            <CheckCircle2 className="h-8 w-8 text-success" />
          </div>
          <h1 className="text-xl font-semibold text-coop-gray-900">Tack för ditt önskemål!</h1>
          <p className="mt-2 text-sm text-coop-gray-600">
            Vi har tagit emot ditt önskemål och återkommer när vi har mer information.
          </p>
          {statusUrl && (
            <div className="mt-5 rounded-2xl border border-border/60 bg-coop-gray-100 p-4 text-left space-y-3">
              <p className="text-sm font-medium text-coop-gray-900">Följ ditt önskemål</p>
              <p className="text-xs text-coop-gray-600">
                Spara länken nedan för att se status på ditt önskemål:
              </p>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={statusUrl}
                  className="flex-1 rounded-xl border border-border/60 bg-muted px-3 py-2 text-xs font-mono text-coop-gray-900 outline-none"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(statusUrl);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="shrink-0 rounded-xl border border-border/60 bg-coop-gray-100 px-3 py-2 text-xs font-medium text-coop-gray-900 transition-colors hover:bg-muted"
                >
                  {copied ? "Kopierat!" : "Kopiera"}
                </button>
              </div>
              <a
                href={statusUrl}
                className="block rounded-xl bg-primary px-4 py-2.5 text-center text-sm font-medium text-primary-foreground"
              >
                Visa status
              </a>
            </div>
          )}
          <button
            className="mt-5 rounded-full border border-border/60 bg-coop-gray-100 px-6 py-2.5 text-sm font-medium text-coop-gray-900"
            onClick={() => {
              setDone(false);
              setStatusUrl(null);
              setImages([]);
              setPreviews([]);
              setForm({ product_name: "", notes: "", priority: "normal" });
            }}
          >
            Skicka ett till önskemål
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/60 bg-coop-gray-100 px-4 py-4">
        <div className="mx-auto max-w-lg">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <ShoppingCart className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="font-semibold text-coop-gray-900">Skicka in kundönskemål</h1>
              <p className="text-xs text-coop-gray-600">{storeName}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-lg space-y-4 p-4">
        {/* Product name */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Vilken produkt önskar du? *</Label>
          <Input
            value={form.product_name}
            onChange={(e) => setForm((f) => ({ ...f, product_name: e.target.value }))}
            placeholder="T.ex. Oatly iKaffe 1L..."
            className="text-base"
            autoFocus
          />
        </div>

        {/* Priority */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Hur viktigt är detta för dig?</Label>
          <Select
            value={form.priority}
            onValueChange={(v) => setForm((f) => ({ ...f, priority: v as typeof f.priority }))}
          >
            <SelectTrigger className="h-11 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Inte så viktigt</SelectItem>
              <SelectItem value="normal">Ganska viktigt</SelectItem>
              <SelectItem value="high">Mycket viktigt</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Övrig information (valfritt)</Label>
          <Textarea
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="Berätta mer om vad du önskar..."
            rows={3}
            className="resize-none text-base"
          />
        </div>

        {/* Images */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Bilder (valfritt, max {MAX_IMAGES})</Label>
          {previews.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {previews.map((src, i) => (
                <div
                  key={i}
                  className="relative h-20 w-20 overflow-hidden rounded-xl border border-border/60"
                >
                  <img src={src} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-coop-svart/60 text-coop-vit"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {images.length < MAX_IMAGES && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border/60 bg-muted/30 py-3 text-sm text-coop-gray-600 transition-colors hover:border-primary/40 hover:bg-muted/50"
              >
                <ImagePlus className="h-4 w-4" />
                Välj bild
              </button>
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border/60 bg-muted/30 py-3 text-sm text-coop-gray-600 transition-colors hover:border-primary/40 hover:bg-muted/50"
              >
                <ImagePlus className="h-4 w-4" />
                Ta foto
              </button>
              {/* Gallery picker — no capture */}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => addImages(e.target.files, e.target)}
              />
              {/* Camera picker — capture only */}
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => addImages(e.target.files, e.target)}
              />
            </div>
          )}
        </div>

        <Button
          className="h-12 w-full rounded-2xl text-base font-semibold"
          disabled={!form.product_name.trim() || saving}
          onClick={submit}
        >
          {saving ? "Skickar..." : "Skicka in önskemål"}
        </Button>

        <p className="text-center text-xs text-coop-gray-600">
          Ditt önskemål skickas direkt till butikspersonalen
        </p>
      </div>
    </div>
  );
}
