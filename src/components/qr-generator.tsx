/**
 * QR Code Generator for Shelf Positioning
 * Generates QR codes and ArUco markers for posemesh spatial positioning
 * Staff can print and place these markers on shelves for accurate spatial tracking
 */

import { useState } from "react";
import QRCode from "qrcode";
import { Download, Copy, Printer, RefreshCw, QrCode as QrCodeIcon, Save } from "lucide-react";
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
  /** Type of marker to generate */
  type: "aruco" | "qr" | "combined";
  /** Shelf ID this marker belongs to */
  shelfId: string;
  /** Shelf name for display */
  shelfName: string;
  /** ArUco marker ID (for ArUco type) */
  arucoId?: number;
  /** Marker size in meters (physical print size) */
  sizeMeters: number;
  /** Position on shelf (left, center, right) */
  position: "left" | "center" | "right";
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/** Generate QR code content for posemesh marker */
export function generateMarkerContent(config: MarkerConfig): string {
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

export function QRGenerator() {
  const [config, setConfig] = useState<MarkerConfig>({
    type: "combined",
    shelfId: "shelf-a1",
    shelfName: "Hylla A1 - Kaffe & Te",
    arucoId: 1,
    sizeMeters: 0.1, // 10cm
    position: "center",
  });

  const [generatedQRs, setGeneratedQRs] = useState<
    Array<{ marker: MarkerConfig; dataUrl: string }>
  >([]);
  const [isGenerating, setIsGenerating] = useState(false);

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

  const handleGenerateBatch = async () => {
    setIsGenerating(true);
    try {
      // Generate markers for left, center, right positions
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
        {/* Configuration */}
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
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
                </SelectContent>
              </Select>
            </div>
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
          </div>

          {/* Actions */}
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
