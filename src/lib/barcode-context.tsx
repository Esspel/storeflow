import React, { createContext, useContext, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";
import { supabase } from "@/lib/supabase";

const CameraScanner = React.lazy(() =>
  import("@/components/camera-scanner").then((m) => ({ default: m.CameraScanner })),
);

// Global context so any component can listen to scan events too
type BarcodeScan = { code: string; at: number };
type BarcodeCtx = {
  lastScan: BarcodeScan | null;
  // Subscribe to scan events from any component
  onScan: (fn: (code: string) => void) => () => void;
  openCameraScanner: () => void;
  // Set to true while LockScreen is active so the global handler yields
  setScanSuppressed: (suppressed: boolean) => void;
};

const Ctx = createContext<BarcodeCtx>({
  lastScan: null,
  onScan: () => () => {},
  openCameraScanner: () => {},
  setScanSuppressed: () => {},
});

export function useBarcodeContext() {
  return useContext(Ctx);
}

export function BarcodeProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [lastScan, setLastScan] = useState<BarcodeScan | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const listenersRef = useRef<Set<(code: string) => void>>(new Set());
  // When LockScreen is active it takes exclusive ownership of barcode events
  const suppressedRef = useRef(false);

  const setScanSuppressed = (suppressed: boolean) => {
    suppressedRef.current = suppressed;
  };

  const handleScan = async (code: string) => {
    // Yield to LockScreen when it is active — it has its own useBarcodeScanner
    if (suppressedRef.current) return;

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
        navigate({ to: "/avvikelser" });
        return;
      }
    } catch {}

    // Unknown code — dispatch event so product search panel can open with this code pre-filled
    void label;
    window.dispatchEvent(new CustomEvent("sf-barcode-scan", { detail: { code } }));
  };

  useBarcodeScanner({ onScan: handleScan, acceptAlpha: true });

  const onScan = (fn: (code: string) => void) => {
    listenersRef.current.add(fn);
    return () => listenersRef.current.delete(fn);
  };

  return (
    <Ctx.Provider
      value={{ lastScan, onScan, openCameraScanner: () => setCameraOpen(true), setScanSuppressed }}
    >
      {children}

      {cameraOpen && (
        <React.Suspense fallback={null}>
          <CameraScanner
            onScan={(code) => {
              setCameraOpen(false);
              void handleScan(code);
            }}
            onClose={() => setCameraOpen(false)}
          />
        </React.Suspense>
      )}
    </Ctx.Provider>
  );
}
