import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { TriangleAlert as AlertTriangle, CircleCheck as CheckCircle2, ShoppingCart } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const searchSchema = z.object({
  t: z.string().optional(),
  token: z.string().optional(),
});

export const Route = createFileRoute("/qr-kundonskemal-form")({
  validateSearch: searchSchema,
  ssr: false,
  component: QrKundonskemalFormPage,
});

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
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [statusUrl, setStatusUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!token) { setInvalid(true); setResolving(false); return; }

    supabase
      .from("qr_tokens")
      .select("*, store:stores(id,name)")
      .eq("token", token)
      .eq("token_type", "customer_request_form")
      .maybeSingle()
      .then(({ data }) => {
        if (!data) { setInvalid(true); setResolving(false); return; }
        const store = data.store as { id: string; name: string } | null;
        if (!store) { setInvalid(true); setResolving(false); return; }
        setStoreId(store.id);
        setStoreName(store.name);
        setResolving(false);
      });
  }, [token]);

  const submit = async () => {
    if (!form.product_name.trim() || !storeId) return;
    setSaving(true);
    const { data: inserted, error } = await supabase.from("customer_requests").insert({
      store_id: storeId,
      product_name: form.product_name.trim(),
      notes: form.notes.trim() || null,
      priority: form.priority,
      source: "qr",
    }).select("id").maybeSingle();
    if (!error && inserted?.id) {
      // Create a status token so the customer can follow their request
      const { data: tokenRow } = await supabase.from("qr_tokens").insert({
        token_type: "customer_request_status",
        store_id: storeId,
        meta: { request_id: inserted.id },
      }).select("token").maybeSingle();
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
          <h1 className="text-xl font-semibold text-foreground">Ogiltig QR-kod</h1>
          <p className="mt-2 text-sm text-muted-foreground">
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
          <h1 className="text-xl font-semibold text-foreground">Tack för ditt önskemål!</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Vi har tagit emot ditt önskemål och återkommer när vi har mer information.
          </p>
          {statusUrl && (
            <div className="mt-5 rounded-2xl border border-border/60 bg-card p-4 text-left space-y-3">
              <p className="text-sm font-medium text-foreground">Följ ditt önskemål</p>
              <p className="text-xs text-muted-foreground">
                Spara länken nedan för att se status på ditt önskemål:
              </p>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={statusUrl}
                  className="flex-1 rounded-xl border border-border/60 bg-muted px-3 py-2 text-xs font-mono text-foreground outline-none"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <button
                  onClick={() => { navigator.clipboard?.writeText(statusUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                  className="shrink-0 rounded-xl border border-border/60 bg-card px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
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
            className="mt-5 rounded-full border border-border/60 bg-card px-6 py-2.5 text-sm font-medium text-foreground"
            onClick={() => {
              setDone(false);
              setStatusUrl(null);
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
      <div className="border-b border-border/60 bg-card px-4 py-4">
        <div className="mx-auto max-w-lg">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <ShoppingCart className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="font-semibold text-foreground">Skicka in kundönskemål</h1>
              <p className="text-xs text-muted-foreground">{storeName}</p>
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
          <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v as typeof f.priority }))}>
            <SelectTrigger className="h-11 text-sm"><SelectValue /></SelectTrigger>
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

        <Button
          className="h-12 w-full rounded-2xl text-base font-semibold"
          disabled={!form.product_name.trim() || saving}
          onClick={submit}
        >
          {saving ? "Skickar..." : "Skicka in önskemål"}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          Ditt önskemål skickas direkt till butikspersonalen
        </p>
      </div>
    </div>
  );
}
