/**
 * Shelf Scanner Component
 * Live camera feed with posemesh computer vision detection for QR codes & ArUco markers.
 * Performs real-time shelf scans, product identification, and spatial positioning.
 */

import { useState, useCallback, useRef } from "react";
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
import { usePosemeshDetection } from "@/hooks/usePosemesh";
import type {
  QRCode as QRCodeType,
  Barcode as BarcodeType,
  ArUcoMarker,
  Pose,
  ShelfObservation,
  ObservedProduct,
  Vector3,
} from "@/lib/posemesh/types";
import { lookupProductByEAN, lookupProductByBNR } from "@/lib/coop-products";
import { checkPlanogramCompliance, type PlanogramCheckResult } from "@/lib/planogram-engine";
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
  const [detectedQRs, setDetectedQRs] = useState<QRCodeType[]>([]);
  const [detectedArUcos, setDetectedArUcos] = useState<ArUcoMarker[]>([]);
  const [currentPose, setCurrentPose] = useState<Pose | null>(null);
  const [scanHistory, setScanHistory] = useState<ObservedProduct[]>([]);
  const [scanResult, setScanResult] = useState<PlanogramCheckResult | null>(null);
  const currentPoseRef = useRef<Pose | null>(null);

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
        let productInfo: { name: string; bnr?: string } | null = null;

        // Check if it's an EAN (13 or 8 digits)
        if (/^\d{13}$/.test(barcode.data) || /^\d{8}$/.test(barcode.data)) {
          productInfo = await lookupProductByEAN(barcode.data);
        }
        // Check if it's a BNR (Coop article number, typically 6-7 digits)
        else if (/^\d{6,7}$/.test(barcode.data)) {
          productInfo = await lookupProductByBNR(barcode.data);
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
    // Use ArUco marker for pose estimation if available
    if (markers.length > 0) {
      // For now, we just store the first marker's info
      // Real pose estimation would use known 3D marker positions
    }
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

    // Mock planogram for demo (in real app, fetch from DB)
    const mockPlanogram = {
      id: shelfId,
      store_id: "store-1",
      shelf_marker_id: "marker-a1",
      name: shelfName,
      expected_products: scanHistory.map((item, idx) => ({
        product_id: item.product_id,
        ean: item.ean,
        name: item.name ?? `Produkt ${idx + 1}`,
        brand: "Okänt",
        size: "1x",
        position: {
          shelf_number: 1,
          shelf_position: idx,
          x_offset_inch: (idx % 4) * 3,
          y_offset_inch: 0,
          z_offset_inch: 0,
        },
        facings: 2,
        quantity_per_facing: 2,
        total_quantity: 4,
      })),
      version: 1,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const compliance = checkPlanogramCompliance(mockPlanogram, observation as ShelfObservation);
    setScanResult(compliance);

    if (onScanComplete) {
      onScanComplete(observation, compliance);
    }
  }, [scanHistory, shelfId, shelfName, onScanComplete]);

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
