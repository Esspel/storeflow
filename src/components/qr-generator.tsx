/**
 * ArUco Marker Generator for Shelf Positioning
 * Generates ArUco markers (DICT_4X4_50) for posemesh spatial positioning
 * Staff can print and place these markers on shelves for accurate spatial tracking
 */

import { useState } from "react";
import QRCode from "qrcode";
import { Download, Copy, Printer, RefreshCw, QrCode as QrCodeIcon, Save, Plus, Trash2, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

export interface MarkerConfig {
  /** Type of marker to generate - always aruco for StoreFlow */
  type: "aruco" | "customer-nav" | "combined";
  /** Shelf ID this marker belongs to */
  shelfId: string;
  /** Shelf name for display */
  shelfName: string;
  /** ArUco marker ID (for ArUco type) - DICT_4X4_50: 0-1023 */
  arucoId?: number;
  /** Marker size in meters (physical print size) */
  sizeMeters: number;
  /** Position on shelf (left, center, right) */
  position: "left" | "center" | "right";
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** Store ID for customer-nav type */
  storeId?: string;
  /** Store name for customer-nav type */
  storeName?: string;
}

/** Generate customer navigation QR code content for entrance marker */
export function generateCustomerNavContent(storeId: string, storeName: string): string {
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const navUrl = `${baseUrl}/customer-nav?store=${storeId}`;

  const payload = {
    v: 1,
    t: "customer-nav",
    s: storeId,
    n: storeName,
    u: navUrl,
  };
  return JSON.stringify(payload);
}

/** Generate a printable entrance sign with QR code for customer navigation */
export async function generateEntranceSign(
  storeId: string,
  storeName: string,
  options: { widthMm?: number; heightMm?: number } = {}
): Promise<string> {
  const { widthMm = 210, heightMm = 297 } = options; // A4 by default

  const content = generateCustomerNavContent(storeId, storeName);
  const qrDataUrl = await generateQRCodeDataURL(content, 800);
  const navUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/customer-nav?store=${storeId}`;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Kundnavigering - ${storeName}</title>
      <style>
        @page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }
        body {
          font-family: system-ui, sans-serif;
          margin: 0;
          padding: 20mm;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          background: white;
          color: #111827;
        }
        .container {
          text-align: center;
          max-width: 100%;
        }
        .logo {
          font-size: 48px;
          font-weight: 700;
          color: #0ea5e9;
          margin-bottom: 8px;
          letter-spacing: -0.02em;
        }
        .store-name {
          font-size: 32px;
          font-weight: 600;
          margin-bottom: 24px;
        }
        .tagline {
          font-size: 20px;
          color: #4b5563;
          margin-bottom: 32px;
          max-width: 400px;
        }
        .qr-container {
          background: white;
          padding: 16px;
          border-radius: 12px;
          box-shadow: 0 4px 24px rgba(0,0,0,0.1);
          margin-bottom: 24px;
        }
        .qr-code {
          width: 300px;
          height: 300px;
        }
        .instructions {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-top: 24px;
          text-align: left;
          max-width: 400px;
        }
        .step {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 16px;
          color: #374151;
        }
        .step-number {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: #0ea5e9;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          flex-shrink: 0;
        }
        .url {
          font-family: monospace;
          font-size: 12px;
          color: #6b7280;
          word-break: break-all;
          margin-top: 16px;
          padding: 8px;
          background: #f3f4f6;
          border-radius: 6px;
        }
        @media print {
          body { padding: 0; }
          @page { margin: 0; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">StoreFlow</div>
        <div class="store-name">${storeName}</div>
        <div class="tagline">Skanna för att hitta produkter i butiken</div>
        <div class="qr-container">
          <img src="${qrDataUrl}" class="qr-code" alt="QR-kod för kundnavigering" />
        </div>
        <div class="instructions">
          <div class="step">
            <span class="step-number">1</span>
            <span>Öppna kameran på din telefon</span>
          </div>
          <div class="step">
            <span class="step-number">2</span>
            <span>Skanna QR-koden ovan</span>
          </div>
          <div class="step">
            <span class="step-number">3</span>
            <span>Sök och hitta produkter i butiken</span>
          </div>
        </div>
        <div class="url">${navUrl}</div>
      </div>
    </body>
    </html>
  `;
}

/** Generate QR code content for posemesh marker */
export function generateMarkerContent(config: MarkerConfig): string {
  // Handle customer-nav type separately
  if (config.type === "customer-nav") {
    return generateCustomerNavContent(config.storeId!, config.storeName!);
  }

  const payload = {
    v: 1, // Version
    t: config.type, // Type: aruco, qr, combined
    s: config.shelfId, // Shelf ID
    p: config.position, // Position on shelf
    sz: config.sizeMeters, // Size in meters
    ...(config.arucoId !== undefined && { a: config.arucoId }), // ArUco ID
    ...(config.metadata && { m: config.metadata }), // Metadata
  };
  return JSON.stringify(payload);
}

/** Generate QR code data URL for display/printing */
export async function generateQRCodeDataURL(content: string, size = 512): Promise<string> {
  return QRCode.toDataURL(content, {
    width: size,
    margin: 4,
    color: { dark: "#111827", light: "#ffffff" },
    errorCorrectionLevel: "M",
  });
}

/** Generate a printable sheet with multiple markers */
export async function generatePrintableSheet(
  markers: MarkerConfig[],
  options: { columns?: number; gapMm?: number; labelHeightMm?: number } = {},
): Promise<string> {
  const { columns = 2, gapMm = 10, labelHeightMm = 30 } = options;

  // This would generate a PDF or HTML for printing
  // For now, return HTML string
  const qrPromises = markers.map(async (marker) => {
    const content = generateMarkerContent(marker);
    const dataUrl = await generateQRCodeDataURL(content, 400);
    return { marker, dataUrl };
  });

  const results = await Promise.all(qrPromises);

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Hyllmarkörer - ${markers[0]?.shelfName || "Markörer"}</title>
      <style>
        @page { size: A4; margin: 15mm; }
        body { font-family: system-ui, sans-serif; margin: 0; padding: 20px; }
        .grid { display: grid; grid-template-columns: repeat(${columns}, 1fr); gap: ${gapMm}mm; }
        .card { text-align: center; page-break-inside: avoid; }
        .qr { width: 100%; max-width: 150mm; }
        .label { margin-top: 8px; font-size: 12px; }
        .header { text-align: center; margin-bottom: 20px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Hyllmarkörer för ${markers[0]?.shelfName || "markörer"}</h1>
        <p>Skriv ut och placer markörerna på hyllorna för posemesh-positionering</p>
      </div>
      <div class="grid">
        ${results
          .map(
            ({ marker, dataUrl }) => `
          <div class="card">
            <img src="${dataUrl}" class="qr" alt="QR-kod för ${marker.shelfId} ${marker.position}"/>
            <div class="label">
              <strong>${marker.shelfName}</strong> - ${marker.position} (${marker.type})<br/>
              ArUco ID: ${marker.arucoId ?? "N/A"} | Storlek: ${marker.sizeMeters}m
            </div>
          </div>
        `,
          )
          .join("")}
      </div>
    </body>
    </html>
  `;
}

interface QRGeneratorProps {
  onPortalsGenerated?: (configs: MarkerConfig[]) => void;
  storeId?: string;
  storeName?: string;
}

export function QRGenerator({ onPortalsGenerated, storeId, storeName }: QRGeneratorProps) {
  const [config, setConfig] = useState<MarkerConfig>({
    type: "combined",
    shelfId: "shelf-a1",
    shelfName: "Hylla A1 - Kaffe & Te",
    arucoId: 1,
    sizeMeters: 0.1, // 10cm
    position: "center",
  });

  const [shelves, setShelves] = useState<Array<{ id: string; name: string }>>([
    { id: "shelf-a1", name: "Hylla A1 - Kaffe & Te" },
    { id: "shelf-a2", name: "Hylla A2 - Frukost & Flingor" },
    { id: "shelf-b1", name: "Hylla B1 - Engångsartiklar" },
  ]);

  const [generatedQRs, setGeneratedQRs] = useState<
    Array<{ marker: MarkerConfig; dataUrl: string }>
  >([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [allMarkerConfigs, setAllMarkerConfigs] = useState<MarkerConfig[]>([]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const content = generateMarkerContent(config);
      const dataUrl = await generateQRCodeDataURL(content);
      setGeneratedQRs([{ marker: config, dataUrl }]);
    } catch (error) {
      console.error("Failed to generate QR code:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateEntranceSign = async () => {
    if (!storeId || !storeName) {
      toast.error("Store ID och Store namn krävs för kundnavigering");
      return;
    }
    setIsGenerating(true);
    try {
      const html = await generateEntranceSign(storeId, storeName);
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => printWindow.print(), 500);
      }
      toast.success("Entréskylt genererad!");
    } catch (error) {
      console.error("Failed to generate entrance sign:", error);
      toast.error("Kunde inte generera entréskylt");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateBatch = async () => {
    setIsGenerating(true);
    try {
      // Generate markers for left, center, right positions for the current shelf
      const positions: MarkerConfig["position"][] = ["left", "center", "right"];
      const markers = positions.map((position, index) => ({
        ...config,
        position,
        arucoId: config.arucoId ? config.arucoId + index : undefined,
      }));

      const results = await Promise.all(
        markers.map(async (marker) => {
          const content = generateMarkerContent(marker);
          const dataUrl = await generateQRCodeDataURL(content);
          return { marker, dataUrl };
        }),
      );

      setGeneratedQRs(results);
    } catch (error) {
      console.error("Failed to generate batch:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateAllShelves = async () => {
    setIsGenerating(true);
    try {
      const positions: MarkerConfig["position"][] = ["left", "center", "right"];
      const allConfigs: MarkerConfig[] = [];
      const allResults: Array<{ marker: MarkerConfig; dataUrl: string }> = [];

      for (let i = 0; i < shelves.length; i++) {
        const shelf = shelves[i];
        const shelfMarkers = positions.map((position, posIndex) => ({
          type: "combined" as const,
          shelfId: shelf.id,
          shelfName: shelf.name,
          arucoId: (i * 3) + posIndex + 1,
          sizeMeters: 0.1,
          position,
        }));

        allConfigs.push(...shelfMarkers);

        const results = await Promise.all(
          shelfMarkers.map(async (marker) => {
            const content = generateMarkerContent(marker);
            const dataUrl = await generateQRCodeDataURL(content);
            return { marker, dataUrl };
          }),
        );

        allResults.push(...results);
      }

      setAllMarkerConfigs(allConfigs);
      setGeneratedQRs(allResults);
      onPortalsGenerated?.(allConfigs);
      toast.success(`${shelves.length} hyllor med ${allConfigs.length} markörer genererade!`);
    } catch (error) {
      console.error("Failed to generate all shelves:", error);
      toast.error("Kunde inte generera alla markörer");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAddShelf = () => {
    const nextNum = shelves.length + 1;
    const section = String.fromCharCode(65 + Math.floor((nextNum - 1) / 3));
    const shelfNum = ((nextNum - 1) % 3) + 1;
    setShelves([
      ...shelves,
      { id: `shelf-${section.toLowerCase()}${shelfNum}`, name: `Hylla ${section}${shelfNum} - Ny hylla` },
    ]);
  };

  const handleDownload = async (dataUrl: string, filename: string) => {
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = filename;
    link.click();
  };

  const handlePrint = async () => {
    if (generatedQRs.length === 0) return;

    const markers = generatedQRs.map(({ marker }) => marker);
    const html = await generatePrintableSheet(markers);

    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      // Wait for images to load then print
      setTimeout(() => printWindow.print(), 500);
    }
  };

  const handleCopyContent = async () => {
    const content = generateMarkerContent(config);
    await navigator.clipboard.writeText(content);
  };

  return (
    <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <QrCodeIcon className="w-5 h-5 text-indigo-500" />
          Generera hyllmarkörer (QR / ArUco)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Shelf Management */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-slate-900 dark:text-slate-100">Hyllor att generera markörer för</h4>
            <Button size="sm" variant="outline" onClick={handleAddShelf} className="gap-1">
              <Plus className="w-3.5 h-3.5" />
              Lägg till hylla
            </Button>
          </div>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {shelves.map((shelf, index) => (
              <div
                key={shelf.id}
                className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border"
              >
                <span className="w-8 h-8 flex items-center justify-center rounded bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-sm font-medium">
                  {index + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <Input
                    value={shelf.id}
                    onChange={(e) => setShelves(shelves.map((s, i) => i === index ? { ...s, id: e.target.value } : s))}
                    placeholder="shelf-id"
                    className="text-sm"
                  />
                  <Input
                    value={shelf.name}
                    onChange={(e) => setShelves(shelves.map((s, i) => i === index ? { ...s, name: e.target.value } : s))}
                    placeholder="Hylla namn"
                    className="text-sm mt-1"
                  />
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShelves(shelves.filter((_, i) => i !== index))}
                  className="text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* Configuration for selected shelf */}
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Store fields for customer-nav type */}
            {config.type === "customer-nav" && (
              <>
                <div className="sm:col-span-2">
                  <Label htmlFor="storeId">Butik ID (Store ID)</Label>
                  <Input
                    id="storeId"
                    value={config.storeId ?? ""}
                    onChange={(e) => setConfig({ ...config, storeId: e.target.value })}
                    placeholder="t.ex. uuid-butik-id"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="storeName">Butik namn</Label>
                  <Input
                    id="storeName"
                    value={config.storeName ?? ""}
                    onChange={(e) => setConfig({ ...config, storeName: e.target.value })}
                    placeholder="t.ex. Coop Östra Torget"
                  />
                </div>
              </>
            )}

            {/* Shelf fields for other types */}
            {config.type !== "customer-nav" && (
              <>
                <div>
                  <Label htmlFor="shelfId">Hylla ID</Label>
                  <Input
                    id="shelfId"
                    value={config.shelfId}
                    onChange={(e) => setConfig({ ...config, shelfId: e.target.value })}
                    placeholder="t.ex. shelf-a1"
                  />
                </div>
                <div>
                  <Label htmlFor="shelfName">Hylla namn</Label>
                  <Input
                    id="shelfName"
                    value={config.shelfName}
                    onChange={(e) => setConfig({ ...config, shelfName: e.target.value })}
                    placeholder="t.ex. Hylla A1 - Kaffe & Te"
                  />
                </div>
              </>
            )}

            <div>
              <Label htmlFor="type">Markörtyp</Label>
              <Select
                value={config.type}
                onValueChange={(value) =>
                  setConfig({ ...config, type: value as MarkerConfig["type"] })
                }
              >
                <SelectTrigger id="type">
                  <SelectValue placeholder="Välj typ" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="combined">Kombinerad (QR + ArUco)</SelectItem>
                  <SelectItem value="aruco">Endast ArUco</SelectItem>
                  <SelectItem value="qr">Endast QR</SelectItem>
                  <SelectItem value="customer-nav">Kundnavigering (Entré)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {config.type !== "customer-nav" && (
              <>
                <div>
                  <Label htmlFor="position">Position på hylla</Label>
                  <Select
                    value={config.position}
                    onValueChange={(value) =>
                      setConfig({ ...config, position: value as MarkerConfig["position"] })
                    }
                  >
                    <SelectTrigger id="position">
                      <SelectValue placeholder="Välj position" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="left">Vänster</SelectItem>
                      <SelectItem value="center">Centrerad</SelectItem>
                      <SelectItem value="right">Höger</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="arucoId">ArUco ID</Label>
                  <Input
                    id="arucoId"
                    type="number"
                    min="0"
                    max="1023"
                    value={config.arucoId ?? ""}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        arucoId: e.target.value ? parseInt(e.target.value, 10) : undefined,
                      })
                    }
                    placeholder="t.ex. 1"
                  />
                </div>
                <div>
                  <Label htmlFor="sizeMeters">Fysisk storlek (meter)</Label>
                  <Input
                    id="sizeMeters"
                    type="number"
                    min="0.05"
                    max="1"
                    step="0.01"
                    value={config.sizeMeters}
                    onChange={(e) => setConfig({ ...config, sizeMeters: parseFloat(e.target.value) })}
                    placeholder="0.10 (10 cm)"
                  />
                </div>
              </>
            )}
          </div>

          {/* Actions - Shelf Markers */}
          {config.type !== "customer-nav" && (
            <div className="flex flex-wrap gap-3 pt-2 border-t border-slate-200 dark:border-slate-700">
              <Button onClick={handleGenerate} disabled={isGenerating} className="gap-2">
                <RefreshCw className="w-4 h-4" />
                Generera enskild
              </Button>
              <Button
                onClick={handleGenerateBatch}
                disabled={isGenerating}
                variant="outline"
                className="gap-2"
              >
                <QrCodeIcon className="w-4 h-4" />
                Generera batch (V/C/H)
              </Button>
              <Button
                onClick={handleGenerateAllShelves}
                disabled={isGenerating || shelves.length === 0}
                className="gap-2 bg-indigo-600 hover:bg-indigo-500 text-white"
              >
                <QrCodeIcon className="w-4 h-4" />
                Generera ALLA hyllor ({shelves.length})
              </Button>
              <Button
                onClick={handlePrint}
                disabled={generatedQRs.length === 0}
                variant="outline"
                className="gap-2"
              >
                <Printer className="w-4 h-4" />
                Skriv ut ark
              </Button>
              <Button onClick={handleCopyContent} variant="ghost" className="gap-2">
                <Copy className="w-4 h-4" />
                Kopiera innehåll
              </Button>
            </div>
          )}

          {/* Actions - Customer Navigation Entrance Sign */}
          {config.type === "customer-nav" && (
            <div className="flex flex-wrap gap-3 pt-2 border-t border-slate-200 dark:border-slate-700">
              <Button
                onClick={handleGenerateEntranceSign}
                disabled={isGenerating || !storeId || !storeName}
                className="gap-2 bg-indigo-600 hover:bg-indigo-500 text-white"
              >
                <Printer className="w-4 h-4" />
                Generera & skriv ut entréskylt
              </Button>
              <Button
                onClick={handleGenerateEntranceSign}
                disabled={isGenerating || !storeId || !storeName}
                variant="outline"
                className="gap-2"
              >
                <QrCodeIcon className="w-4 h-4" />
                Förhandsgranska entréskylt
              </Button>
              <Button onClick={handleCopyContent} variant="ghost" className="gap-2">
                <Copy className="w-4 h-4" />
                Kopiera QR-innehåll
              </Button>
            </div>
          )}
        </div>

        {/* Preview */}
        {generatedQRs.length > 0 && (
          <div className="space-y-4">
            <Separator />
            <h4 className="text-sm font-medium text-slate-900 dark:text-slate-100">
              Förhandsgranskning
            </h4>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {generatedQRs.map(({ marker, dataUrl }, index) => (
                <div
                  key={index}
                  className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 text-center"
                >
                  <div className="mb-3">
                    <img
                      src={dataUrl}
                      alt={`QR-kod ${marker.shelfId} ${marker.position}`}
                      className="mx-auto w-48 h-48 sm:w-64 sm:h-64"
                    />
                  </div>
                  <div className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
                    <p className="font-medium text-slate-900 dark:text-slate-100">
                      {marker.shelfName}
                    </p>
                    <p>Position: {marker.position}</p>
                    <p>Typ: {marker.type}</p>
                    <p>ArUco ID: {marker.arucoId ?? "N/A"}</p>
                    <p>Storlek: {marker.sizeMeters}m</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 w-full gap-1"
                    onClick={() =>
                      handleDownload(
                        dataUrl,
                        `${marker.shelfId}-${marker.position}-${marker.type}.png`,
                      )
                    }
                  >
                    <Download className="w-3 h-3" />
                    Ladda ner PNG
                  </Button>
                </div>
              ))}
            </div>

            {/* Raw content for debugging */}
            <details className="mt-4 p-3 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <summary className="text-xs font-medium text-slate-600 dark:text-slate-400 cursor-pointer">
                Visa QR-kod innehåll (JSON)
              </summary>
              <pre className="mt-2 text-xs text-slate-700 dark:text-slate-300 overflow-auto">
                {generateMarkerContent(config)}
              </pre>
            </details>
          </div>
        )}

        {/* Instructions */}
        <details className="p-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl">
          <summary className="font-medium text-indigo-700 dark:text-indigo-300 cursor-pointer flex items-center gap-2">
            <QrCodeIcon className="w-5 h-5" />
            Instruktioner för hyllmarkörer
          </summary>
          <div className="mt-3 space-y-2 text-sm text-indigo-600 dark:text-indigo-400">
            <ol className="list-decimal list-inside space-y-1">
              <li>Välj hylla och konfigurera markörinställningar</li>
              <li>
                Klicka "Generera batch (V/C/H)" för att skapa markörer för vänster, center, höger
              </li>
              <li>
                Klicka "Skriv ut ark" för att skriva ut på A4-papper (rekommenderat: matt papper,
                150+ DPI)
              </li>
              <li>Klipp ut markörerna och limma på hyllkanten (vänster, mitten, höger)</li>
              <li>Se till att markörerna är synliga och inte täckta av produkter</li>
              <li>Använd "Shelf Scanner" för att verifiera att markörerna detekteras korrekt</li>
            </ol>
            <p className="mt-2 text-xs text-indigo-500 dark:text-indigo-500">
              <strong>Tips:</strong> ArUco-markörer (ID 0-1023) ger bättre pose-uppskattning än
              QR-koder. Använd unika ArUco-ID per hylla. Storlek 10-15 cm rekommenderas för avstånd
              0.5-2m.
            </p>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
