/**
 * Shelf Scanner Component
 * Live camera feed with posemesh computer vision detection for QR codes & ArUco markers.
 * Performs real-time shelf scans, product identification, and spatial positioning.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Camera,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  ScanLine,
  X,
  Eye,
  Layers,
  QrCode,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { usePosemeshDetection } from "@/hooks/usePosemesh";
import type {
  QRCode as QRCodeType,
  Barcode as BarcodeType,
  ArUcoMarker,
  Pose,
  ShelfObservation,
  ObservedProduct,
  Vector3,
  ShelfPlanogram as PosemeshShelfPlanogram,
  ExpectedProduct as PosemeshExpectedProduct,
} from "@/lib/posemesh/types";
import type {
  ShelfPlanogram as SupabaseShelfPlanogram,
  ExpectedProduct as SupabaseExpectedProduct,
} from "@/lib/supabase";
import { lookupProductByEan, lookupProductByBnr } from "@/lib/coop-products";
import { checkPlanogramCompliance, type PlanogramCheckResult } from "@/lib/planogram-engine";
import { getShelfPlanograms } from "@/lib/supabase";
import { useShelfLifeForProducts } from "@/hooks/use-shelf-life";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ShelfScannerProps {
  shelfId: string;
  shelfName?: string;
  onScanComplete?: (
    observation: Partial<ShelfObservation>,
    compliance?: PlanogramCheckResult,
  ) => void;
  onClose?: () => void;
}

export function ShelfScanner({
  shelfId,
  shelfName = "Hylla A1",
  onScanComplete,
  onClose,
}: ShelfScannerProps) {
  const { activeStore } = useAuth();
  const [detectedQRs, setDetectedQRs] = useState<QRCodeType[]>([]);
  const [detectedArUcos, setDetectedArUcos] = useState<ArUcoMarker[]>([]);
  const [currentPose, setCurrentPose] = useState<Pose | null>(null);
  const [scanHistory, setScanHistory] = useState<ObservedProduct[]>([]);
  const [scanResult, setScanResult] = useState<PlanogramCheckResult | null>(null);
  const [planogram, setPlanogram] = useState<SupabaseShelfPlanogram | null>(null);
  const [planogramLoading, setPlanogramLoading] = useState(true);
  const currentPoseRef = useRef<Pose | null>(null);

  // Fetch real planogram from database
  useEffect(() => {
    if (!activeStore?.id || !shelfId) {
      setTimeout(() => {
        setPlanogram(null);
        setPlanogramLoading(false);
      }, 0);
      return;
    }

    const fetchPlanogram = async () => {
      try {
        setTimeout(() => setPlanogramLoading(true), 0);
        const planograms = await getShelfPlanograms(activeStore.id);
        // Find planogram linked to this shelf marker
        const found = planograms.find((p) => p.shelf_marker_id === shelfId);
        if (found) {
          setTimeout(() => setPlanogram(found), 0);
        } else {
          setTimeout(() => setPlanogram(null), 0);
        }
      } catch (err) {
        console.error("Failed to fetch planogram:", err);
        setTimeout(() => setPlanogram(null), 0);
      } finally {
        setTimeout(() => setPlanogramLoading(false), 0);
      }
    };

    fetchPlanogram();
  }, [activeStore?.id, shelfId]);

  const onQRDetected = useCallback((codes: QRCodeType[]) => {
    setDetectedQRs(codes);
    // Convert QR codes into observed products
    codes.forEach((qr) => {
      if (qr.data) {
        setScanHistory((prev) => {
          const exists = prev.some((item) => item.ean === qr.data || item.product_id === qr.data);
          if (exists) return prev;
          const newObserved: ObservedProduct = {
            product_id: qr.data,
            ean: qr.data,
            name: `Produkt (${qr.data.slice(-4)})`,
            position: currentPoseRef.current
              ? currentPoseRef.current.position
              : { x: 0, y: 0, z: 0 },
            confidence: qr.confidence ?? 0.8,
            marker_id: `qr-${qr.data.slice(0, 8)}`,
            facing_count: 1,
          };
          return [...prev, newObserved];
        });
      }
    });
  }, []);

  const onBarcodeDetected = useCallback((codes: BarcodeType[]) => {
    // Convert barcodes (EAN-13, EAN-8, UPC, Code128) into observed products
    codes.forEach(async (barcode) => {
      if (barcode.data) {
        // Try to look up product from Coop sortiment by EAN or BNR
        let productInfo: { name: string; bnr?: string; sap_article_id?: string } | null = null;

        // Check if it's an EAN (13 or 8 digits)
        if (/^\d{13}$/.test(barcode.data) || /^\d{8}$/.test(barcode.data)) {
          const product = await lookupProductByEan(barcode.data);
          if (product) productInfo = { name: product.name, bnr: product.bnr, sap_article_id: product.sap_article_id };
        }
        // Check if it's a BNR (Coop article number, typically 6-7 digits)
        else if (/^\d{6,7}$/.test(barcode.data)) {
          const product = await lookupProductByBnr(barcode.data);
          if (product) productInfo = { name: product.name, bnr: product.bnr, sap_article_id: product.sap_article_id };
        }

        setScanHistory((prev) => {
          const exists = prev.some(
            (item) => item.ean === barcode.data || item.product_id === barcode.data,
          );
          if (exists) return prev;
          const newObserved: ObservedProduct = {
            product_id: barcode.data,
            ean: barcode.data,
            name: productInfo?.name ?? `Produkt (${barcode.format}: ${barcode.data.slice(-4)})`,
            position: currentPoseRef.current
              ? currentPoseRef.current.position
              : { x: 0, y: 0, z: 0 },
            confidence: barcode.confidence ?? 0.9,
            marker_id: `barcode-${barcode.format}-${barcode.data.slice(0, 8)}`,
            facing_count: 1,
            bnr: productInfo?.bnr,
          };
          return [...prev, newObserved];
        });
      }
    });
  }, []);

  const onArUcoDetected = useCallback((markers: ArUcoMarker[]) => {
    setDetectedArUcos(markers);
    // Use ArUco markers for pose estimation via usePosemeshToThree
  }, []);

  const onPoseEstimated = useCallback((pose: Pose) => {
    setCurrentPose(pose);
    currentPoseRef.current = pose;
  }, []);

  const onError = useCallback((error: Error) => {
    console.error("posemesh detection error:", error);
  }, []);

  const { start, stop, isScanning, error, videoRef, canvasRef } = usePosemeshDetection({
    facingMode: "environment",
    scanIntervalMs: 200,
    callbacks: {
      onQRDetected,
      onBarcodeDetected,
      onArUcoDetected,
      onPoseEstimated,
      onError,
    },
  });

  const runComplianceCheck = useCallback(() => {
    if (scanHistory.length === 0) return;

    // Create observation from scan history
    const observation: Partial<ShelfObservation> = {
      observed_products: scanHistory,
      missing_products: [],
      extra_products: [],
      compliance_score: 0,
      misplaced_products: [],
      captured_by: "camera",
      capture_method: "camera",
      captured_at: new Date().toISOString(),
    };

    // Use planogram from DB if available
    let planogramToUse: PosemeshShelfPlanogram | null = null;

    if (planogram) {
      // Convert Supabase planogram to posemesh type
      planogramToUse = {
        id: planogram.id,
        store_id: planogram.store_id,
        shelf_marker_id: planogram.shelf_marker_id ?? "",
        name: planogram.name,
        expected_products: planogram.expected_products.map((p) => ({
          product_id: p.product_id,
          ean: p.ean,
          name: p.name,
          brand: p.brand ?? "Okänt",
          size: p.size ?? "1x",
          position: {
            shelf_number: 1,
            shelf_position: p.position?.x ?? 0,
            x_offset_inch: p.position?.x ?? 0,
            y_offset_inch: p.position?.y ?? 0,
            z_offset_inch: p.position?.z ?? 0,
          },
          facings: p.facings,
          quantity_per_facing: p.quantity ?? 1,
          total_quantity: p.facings * (p.quantity ?? 1),
        })),
        version: planogram.version,
        is_active: planogram.is_active,
        created_at: planogram.created_at,
        updated_at: planogram.updated_at ?? planogram.created_at,
      };
    }

    if (!planogramToUse) {
      // Inget planogram kopplat — visa tomt läge
      return {
        shelfId,
        shelfName,
        observation,
        compliance: {
          overall_score: 0,
          matched: 0,
          misplaced: 0,
          missing: 0,
          extra: 0,
          shelf_life_issues: 0,
          shelf_life_flagged_products: [],
          shelf_life_details: {},
        },
        needsPlanogramImport: true,
        message: "Ett planogram måste importeras först för denna hylla.",
      };
    }

    // Get shelf life status for products that have SAP article IDs
    const sapIds = scanHistory
      .filter((p): p is (ObservedProduct & { sap_article_id: string }) =>
        (p as any).sap_article_id != null
      )
      .map((p) => (p as any).sap_article_id as string);

    // Fetch shelf life status
    const { shelfLifeBySap } = useShelfLifeForProducts(sapIds);

    const compliance = checkPlanogramCompliance(planogramToUse!, observation as ShelfObservation);

    // Add shelf life flagging data to the result
    const shelfLifeEnrichment: Record<string, boolean> = {};
    sapIds.forEach((id) => {
      shelfLifeEnrichment[id] = shelfLifeBySap[id]?.is_flagged ?? false;
    });

    const enrichedCompliance: PlanogramCheckResult & { shelfLifeFlags?: Record<string, boolean> } = {
      ...compliance,
      shelfLifeFlags: shelfLifeEnrichment,
    };

    setScanResult(enrichedCompliance);

    if (onScanComplete) {
      onScanComplete(observation, compliance);
    }
  }, [scanHistory, shelfId, shelfName, onScanComplete, planogram]);

  return (
    <div className="relative flex flex-col h-full bg-slate-950 text-white rounded-xl overflow-hidden border border-slate-800 shadow-2xl">
      {/* Top Header */}
      <div className="flex items-center justify-between p-4 bg-slate-900/90 border-b border-slate-800 z-10">
        <div className="flex items-center gap-2">
          <ScanLine className="w-5 h-5 text-indigo-400 animate-pulse" />
          <h3 className="font-semibold text-sm sm:text-base">
            {shelfName} — Hyllskanning (posemesh)
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {planogramLoading && (
            <div className="flex items-center gap-1 text-xs text-slate-400">
              <div className="animate-spin rounded-full h-3 w-3 border-2 border-indigo-500 border-t-transparent" />
              Laddar planogram...
            </div>
          )}
          <Badge
            variant={isScanning ? "default" : "outline"}
            className={
              isScanning
                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                : "text-slate-400"
            }
          >
            {isScanning ? "CV Aktiv" : "Pausad"}
          </Badge>
          {planogram && !planogramLoading && (
            <Badge
              variant="secondary"
              className="text-emerald-300 bg-emerald-500/20 border-emerald-500/30"
            >
              Planogram laddat
            </Badge>
          )}
          {onClose && (
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-slate-400 hover:text-white"
              onClick={onClose}
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Video Feed Area */}
      <div className="relative flex-1 bg-black flex items-center justify-center min-h-[300px] overflow-hidden">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          playsInline
          muted
        />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

        {!isScanning && !scanResult && (
          <div className="z-10 text-center p-6 bg-slate-900/80 backdrop-blur rounded-xl border border-slate-700 mx-4">
            <Camera className="w-12 h-12 mx-auto text-slate-400 mb-3" />
            <p className="text-slate-300 mb-4">
              Tryck på "Starta skanning" för att börja detektera QR-koder och ArUco-markörer
            </p>
            <Button onClick={start} size="lg" className="w-full sm:w-auto">
              <Camera className="w-4 h-4 mr-2" />
              Starta skanning
            </Button>
          </div>
        )}

        {error && (
          <div className="z-10 absolute bottom-4 left-4 right-4 mx-4 p-3 bg-red-500/90 text-white rounded-lg border border-red-400 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span className="text-sm flex-1">{error.message}</span>
            <Button
              size="sm"
              variant="ghost"
              className="text-white hover:bg-white/10"
              onClick={() => {
                stop();
                start();
              }}
            >
              Försök igen
            </Button>
          </div>
        )}

        {/* Detection overlay info */}
        {isScanning && (
          <div className="z-10 absolute bottom-4 left-4 right-4 mx-4 flex flex-col gap-2">
            <div className="bg-slate-900/80 backdrop-blur rounded-lg border border-slate-700 p-3 flex flex-wrap gap-4 text-xs">
              <span className="flex items-center gap-1">
                <QrCode className="w-3.5 h-3.5" /> QR: {detectedQRs.length}
              </span>
              <span className="flex items-center gap-1">
                <Layers className="w-3.5 h-3.5" /> ArUco: {detectedArUcos.length}
              </span>
              <span className="flex items-center gap-1">
                <Eye className="w-3.5 h-3.5" /> Produkter: {scanHistory.length}
              </span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={stop} className="flex-1">
                <X className="w-4 h-4 mr-2" />
                Stoppa
              </Button>
              <Button
                onClick={runComplianceCheck}
                disabled={scanHistory.length === 0}
                className="flex-1"
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Kontrollera planogram
              </Button>
            </div>
          </div>
        )}

        {/* Results Panel */}
        {scanResult && !isScanning && (
          <div className="z-10 absolute inset-4 m-4 p-4 bg-slate-900/95 backdrop-blur rounded-xl border border-slate-700 overflow-auto max-h-[80%]">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold">Planogram Compliance</h4>
              <Button variant="ghost" size="icon" onClick={() => setScanResult(null)}>
                <X className="w-5 h-5" />
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="bg-slate-800 rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-emerald-400">
                  {Math.round(scanResult.complianceScore)}%
                </div>
                <div className="text-slate-400 text-xs mt-1">Compliance Score</div>
              </div>
              <div className="bg-slate-800 rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-amber-400">
                  {scanResult.missingProducts.length}
                </div>
                <div className="text-slate-400 text-xs mt-1">Missing</div>
              </div>
              <div className="bg-slate-800 rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-rose-400">
                  {scanResult.misplacedProducts.length}
                </div>
                <div className="text-slate-400 text-xs mt-1">Misplaced</div>
              </div>
            </div>
            {scanResult.missingProducts.length > 0 && (
              <div className="mt-4">
                <h5 className="font-medium text-amber-300 mb-2">Missing Products</h5>
                <ul className="space-y-1 text-sm text-slate-300">
                  {scanResult.missingProducts.slice(0, 5).map((m, i) => (
                    <li key={i} className="flex justify-between">
                      <span>{m.name}</span>
                      <span className="text-amber-400">{m.expected_facings} facings</span>
                    </li>
                  ))}
                  {scanResult.missingProducts.length > 5 && (
                    <li className="text-slate-500">
                      +{scanResult.missingProducts.length - 5} more...
                    </li>
                  )}
                </ul>
              </div>
            )}
            {scanResult.misplacedProducts.length > 0 && (
              <div className="mt-4">
                <h5 className="font-medium text-rose-300 mb-2">Misplaced Products</h5>
                <ul className="space-y-1 text-sm text-slate-300">
                  {scanResult.misplacedProducts.slice(0, 5).map((m, i) => (
                    <li key={i} className="flex justify-between">
                      <span>{m.name}</span>
                      <span className="text-rose-400">{m.distance_meters.toFixed(2)}m off</span>
                    </li>
                  ))}
                  {scanResult.misplacedProducts.length > 5 && (
                    <li className="text-slate-500">
                      +{scanResult.misplacedProducts.length - 5} more...
                    </li>
                  )}
                </ul>
              </div>
            )}
            <div className="mt-4 flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setScanResult(null);
                  setScanHistory([]);
                  setDetectedQRs([]);
                }}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Skanna om
              </Button>
              <Button onClick={runComplianceCheck} className="flex-1">
                Uppdatera
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
