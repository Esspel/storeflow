import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import {
  TriangleAlert as AlertTriangle,
  CircleCheck as CheckCircle2,
  ChevronDown,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
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

export const Route = createFileRoute("/qr-avvikelse")({
  validateSearch: searchSchema,
  ssr: false,
  component: QrAvvikelsePage,
});

type TokenMeta = {
  zone_name?: string;
  category?: string;
};

const CATEGORIES = ["Drift", "Kvalitet", "Säkerhet", "Hygien", "Personal", "Övrigt"];
const PRIORITIES = [
  { value: "Låg", label: "Låg" },
  { value: "Medel", label: "Medel" },
  { value: "Hög", label: "Hög" },
  { value: "Kritisk", label: "Kritisk" },
];

function QrAvvikelsePage() {
  const search = useSearch({ from: "/qr-avvikelse" });
  const token = search.t ?? search.token;

  const [resolving, setResolving] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [storeName, setStoreName] = useState("");
  const [meta, setMeta] = useState<TokenMeta>({});

  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "Drift",
    priority: "Medel" as "Låg" | "Medel" | "Hög" | "Kritisk",
    reporter_name: "",
  });
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [submitError, setSubmitError] = useState(false);

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
      .eq("token_type", "incident_zone")
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
        const m = (data.meta ?? {}) as TokenMeta;
        setMeta(m);
        setForm((f) => ({
          ...f,
          category: m.category ?? "Drift",
          title: m.zone_name ? `Avvikelse i ${m.zone_name}` : "",
        }));
        setResolving(false);
      });
  }, [token]);

  const submit = async () => {
    if (!form.title.trim() || !storeId) return;
    setSaving(true);
    const { error } = await supabase.from("incidents").insert({
      title: form.title.trim(),
      description: form.description.trim() || null,
      category: form.category,
      priority: form.priority,
      store_id: storeId,
      status: "open",
      source: "qr",
    });
    setSaving(false);
    if (!error) {
      setDone(true);
    } else {
      setSubmitError(true);
    }
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
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-success/10">
            <CheckCircle2 className="h-8 w-8 text-success" />
          </div>
          <h1 className="text-xl font-semibold text-foreground">Avvikelse registrerad</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Tack! Din avvikelse har registrerats och personalen har blivit meddelade.
          </p>
          <button
            className="mt-6 rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground"
            onClick={() => {
              setDone(false);
              setForm((f) => ({
                ...f,
                title: meta.zone_name ? `Avvikelse i ${meta.zone_name}` : "",
                description: "",
                reporter_name: "",
              }));
            }}
          >
            Registrera en till
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
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <h1 className="font-semibold text-foreground">Rapportera avvikelse</h1>
              <p className="text-xs text-muted-foreground">
                {storeName}
                {meta.zone_name ? ` · ${meta.zone_name}` : ""}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-lg space-y-4 p-4">
        {/* Title */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Vad har hänt? *</Label>
          <Input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Kort beskrivning av avvikelsen"
            className="text-base"
          />
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Mer detaljer</Label>
          <Textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Beskriv vad du observerat..."
            rows={3}
            className="resize-none text-base"
          />
        </div>

        {/* Category + Priority */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Kategori</Label>
            <Select
              value={form.category}
              onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}
            >
              <SelectTrigger className="h-11 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Allvarlighet</Label>
            <Select
              value={form.priority}
              onValueChange={(v) => setForm((f) => ({ ...f, priority: v as typeof form.priority }))}
            >
              <SelectTrigger className="h-11 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Submit */}
        {submitError && (
          <div className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive text-center">
            Något gick fel. Försök igen.
          </div>
        )}
        <Button
          className="h-12 w-full rounded-2xl text-base font-semibold"
          disabled={!form.title.trim() || saving}
          onClick={() => {
            setSubmitError(false);
            submit();
          }}
        >
          {saving ? "Skickar..." : "Skicka in avvikelse"}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          Avvikelsen skickas direkt till butikspersonalen
        </p>
      </div>
    </div>
  );
}
