import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { TriangleAlert as AlertTriangle, CircleCheck as CheckCircle2, Clock, Package, ShoppingCart, Circle as XCircle, Ban, ArchiveX } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
  t: z.string().optional(),
  token: z.string().optional(),
});

export const Route = createFileRoute("/qr-kundonskemal")({
  validateSearch: searchSchema,
  ssr: false,
  component: QrKundonskemalPage,
});

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  open: { label: "Inkommit", color: "text-muted-foreground", icon: Clock },
  ordered: { label: "Beställd", color: "text-info", icon: ShoppingCart },
  fulfilled: { label: "Uppfylld", color: "text-success", icon: CheckCircle2 },
  declined: { label: "Avböjd", color: "text-muted-foreground", icon: XCircle },
  not_in_assortment: { label: "Finns ej i sortiment", color: "text-muted-foreground", icon: Ban },
  discontinued: { label: "Utgått", color: "text-muted-foreground", icon: ArchiveX },
};

function QrKundonskemalPage() {
  const search = useSearch({ from: "/qr-kundonskemal" });
  const token = search.t ?? search.token;

  const [resolving, setResolving] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const [request, setRequest] = useState<{
    id: string;
    product_name: string;
    article_number: string | null;
    notes: string | null;
    staff_comment: string | null;
    status: string;
    priority: string;
    created_at: string;
    store_name: string;
  } | null>(null);

  useEffect(() => {
    if (!token) { setInvalid(true); setResolving(false); return; }

    supabase
      .from("qr_tokens")
      .select("meta,store_id")
      .eq("token", token)
      .eq("token_type", "customer_request_status")
      .maybeSingle()
      .then(async ({ data: tokenRow }) => {
        if (!tokenRow) { setInvalid(true); setResolving(false); return; }

        const meta = (tokenRow.meta ?? {}) as { request_id?: string };
        if (!meta.request_id) { setInvalid(true); setResolving(false); return; }

        const { data: req } = await supabase
          .from("customer_requests")
          .select("id,product_name,article_number,notes,staff_comment,status,priority,created_at,store:stores(name)")
          .eq("id", meta.request_id)
          .maybeSingle();

        if (!req) { setInvalid(true); setResolving(false); return; }

        setRequest({
          id: req.id,
          product_name: req.product_name,
          article_number: req.article_number,
          notes: (req as { notes?: string | null }).notes ?? null,
          staff_comment: (req as { staff_comment?: string | null }).staff_comment ?? null,
          status: req.status,
          priority: req.priority,
          created_at: req.created_at,
          store_name: (req.store as { name: string } | null)?.name ?? "",
        });
        setResolving(false);
      });
  }, [token]);

  if (resolving) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (invalid || !request) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="text-xl font-semibold text-foreground">Ogiltig länk</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Den här QR-koden är inte längre giltig.
          </p>
        </div>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[request.status] ?? STATUS_CONFIG.open;
  const StatusIcon = statusCfg.icon;

  const isDetour = ["declined", "not_in_assortment", "discontinued"].includes(request.status);

  // Timeline steps
  const steps = [
    { key: "open", label: "Önskemål mottaget" },
    { key: "ordered", label: "Produkt beställd" },
    { key: "fulfilled", label: "Finns i butiken" },
  ];
  const stepIndex = steps.findIndex((s) => s.key === request.status);
  const activeStep = isDetour ? -1 : stepIndex;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/60 bg-card px-4 py-5">
        <div className="mx-auto max-w-sm text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
            <Package className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-lg font-semibold text-foreground">Status på ditt kundönskemål</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{request.store_name}</p>
        </div>
      </div>

      <div className="mx-auto max-w-sm space-y-6 p-4">
        {/* Product card */}
        <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-foreground">{request.product_name}</p>
            </div>
            <div className={cn("flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1", {
              "bg-success/10": request.status === "fulfilled",
              "bg-info/10": request.status === "ordered",
              "bg-muted": request.status === "open" || isDetour,
            })}>
              <StatusIcon className={cn("h-3.5 w-3.5", statusCfg.color)} />
              <span className={cn("text-xs font-semibold", statusCfg.color)}>{statusCfg.label}</span>
            </div>
          </div>

          {request.notes && (
            <div className="mt-3 rounded-xl border border-border/40 bg-muted/30 px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60 mb-1">Kommentar</p>
              <p className="text-sm text-foreground">{request.notes}</p>
            </div>
          )}

          {request.staff_comment && (
            <div className="mt-3 rounded-xl border border-border/60 bg-primary/5 px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-primary/70 mb-1">Meddelande från butiken</p>
              <p className="text-sm text-foreground">{request.staff_comment}</p>
            </div>
          )}

          <div className="mt-3 border-t border-border/40 pt-3">
            <p className="text-xs text-muted-foreground">
              Registrerat {new Date(request.created_at).toLocaleDateString("sv-SE", {
                year: "numeric", month: "long", day: "numeric",
              })}
            </p>
          </div>
        </div>

        {/* Timeline / Sidospår */}
        {!isDetour ? (
          <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
            <p className="mb-4 text-sm font-semibold text-foreground">Statusspårning</p>
            <div className="space-y-0">
              {steps.map((step, i) => {
                const isCompleted = activeStep >= i;
                const isCurrent = activeStep === i;
                return (
                  <div key={step.key} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-all",
                          isCompleted
                            ? "border-success bg-success/10 text-success"
                            : "border-border bg-muted text-muted-foreground",
                          isCurrent && "ring-2 ring-success/20",
                        )}
                      >
                        {isCompleted ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                      </div>
                      {i < steps.length - 1 && (
                        <div className={cn("my-1 w-0.5 flex-1 min-h-[1.5rem]", isCompleted ? "bg-success/40" : "bg-border/60")} />
                      )}
                    </div>
                    <div className="pb-4 pt-1">
                      <p className={cn("text-sm font-medium", isCompleted ? "text-foreground" : "text-muted-foreground")}>
                        {step.label}
                      </p>
                      {isCurrent && (
                        <p className="mt-0.5 text-xs text-muted-foreground">Nuvarande status</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-border/60 bg-muted/30 p-4 text-center">
            {request.status === "declined" && (
              <>
                <XCircle className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm font-medium text-foreground">Önskemål avböjt</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Tyvärr kan vi inte ta in den här produkten. Se meddelande från butiken ovan eller kontakta personalen för mer information.
                </p>
              </>
            )}
            {request.status === "not_in_assortment" && (
              <>
                <Ban className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm font-medium text-foreground">Finns ej i sortiment</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Denna produkt ingår för närvarande inte i vårt leverantörssortiment och kan inte beställas in.
                </p>
              </>
            )}
            {request.status === "discontinued" && (
              <>
                <ArchiveX className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm font-medium text-foreground">Produkten har utgått</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Denna produkt har utgått ur tillverkarens eller leverantörens sortiment och går tyvärr inte längre att få tag på.
                </p>
              </>
            )}
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground">
          Uppdateras automatiskt av butikspersonalen
        </p>
      </div>
    </div>
  );
}
