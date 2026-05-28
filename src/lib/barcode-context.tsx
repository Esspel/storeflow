import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";
import { supabase } from "@/lib/supabase";

const CameraScanner = React.lazy(() =>
  import("@/components/camera-scanner").then((m) => ({ default: m.CameraScanner }))
);

// Global context so any component can listen to scan events too
type BarcodeScan = { code: string; at: number };
type BarcodeCtx = {
  lastScan: BarcodeScan | null;
  // Subscribe to scan events from any component
  onScan: (fn: (code: string) => void) => () => void;
  openCameraScanner: () => void;
};

const Ctx = createContext<BarcodeCtx>({ lastScan: null, onScan: () => () => {}, openCameraScanner: () => {} });

export function useBarcodeContext() {
  return useContext(Ctx);
}

// Toast shown in the corner after a scan
function ScanToast({ code, label, onClose }: { code: string; label: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div
      className="fixed bottom-24 left-1/2 z-[200] -translate-x-1/2 flex items-center gap-3 rounded-2xl border border-border/60 bg-card px-4 py-3 shadow-[var(--shadow-lg)] animate-in slide-in-from-bottom-4 duration-200"
      style={{ maxWidth: "calc(100vw - 2rem)" }}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary text-lg">
        ▐▌
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">Streckkod scannad</p>
        <p className="truncate text-sm font-bold text-foreground">{label || code}</p>
        <p className="font-mono text-[10px] text-muted-foreground/60">{code}</p>
      </div>
      <button onClick={onClose} className="ml-1 text-muted-foreground hover:text-foreground">
        ✕
      </button>
    </div>
  );
}

export function BarcodeProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [toast, setToast] = useState<{ code: string; label: string } | null>(null);
  const [lastScan, setLastScan] = useState<BarcodeScan | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const listenersRef = useRef<Set<(code: string) => void>>(new Set());

  const handleScan = async (code: string) => {
    const scan = { code, at: Date.now() };
    setLastScan(scan);

    // Notify any listening components first (e.g. a focused dialog waiting for a scan)
    for (const fn of listenersRef.current) fn(code);

    // Look up SAP article ID in tasks/incidents
    // EAN-13/EAN-8 barcodes map to sap_article_id in our data model
    let label = code;
    try {
      const { data: taskMatch } = await supabase
        .from("tasks")
        .select("id, title, sap_article_id")
        .eq("sap_article_id", code)
        .limit(1)
        .maybeSingle();

      if (taskMatch) {
        label = taskMatch.title;
        setToast({ code, label });
        navigate({ to: "/uppgifter" });
        return;
      }

      const { data: incidentMatch } = await supabase
        .from("incidents")
        .select("id, title, sap_article_id")
        .eq("sap_article_id", code)
        .limit(1)
        .maybeSingle();

      if (incidentMatch) {
        label = incidentMatch.title;
        setToast({ code, label });
        navigate({ to: "/avvikelser" });
        return;
      }
    } catch {}

    // Unknown code — show toast and open Mitt Coop search in a new tab
    setToast({ code, label });
    // Dispatch a custom event so the MittCoop panel can open with this code pre-filled
    window.dispatchEvent(new CustomEvent("sf-barcode-scan", { detail: { code } }));
  };

  useBarcodeScanner({ onScan: handleScan, acceptAlpha: true });

  const onScan = (fn: (code: string) => void) => {
    listenersRef.current.add(fn);
    return () => listenersRef.current.delete(fn);
  };

  return (
    <Ctx.Provider value={{ lastScan, onScan, openCameraScanner: () => setCameraOpen(true) }}>
      {children}

      {cameraOpen && (
        <React.Suspense fallback={null}>
          <CameraScanner
            onScan={(code) => { setCameraOpen(false); void handleScan(code); }}
            onClose={() => setCameraOpen(false)}
          />
        </React.Suspense>
      )}

      {toast && (
        <ScanToast
          code={toast.code}
          label={toast.label}
          onClose={() => setToast(null)}
        />
      )}
    </Ctx.Provider>
  );
}
