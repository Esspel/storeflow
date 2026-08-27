/**
 * Step 5 — Store QR
 * Generates a printable QR code that links customers directly to the
 * store-specific /customer-nav route via ?storeId=<uuid>.
 *
 * The QR is the primary entry point for in-store customers — it must be
 * printed and placed at the entrance. Scanning it opens the 3D/AR
 * customer navigation view pre-loaded with this store's digital twin.
 */
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Printer, Download, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export function buildStoreNavUrl(storeId: string): string {
  if (typeof window === "undefined") {
    return `/customer-nav?storeId=${storeId}`;
  }
  return `${window.location.origin}/customer-nav?storeId=${storeId}`;
}

export function Step5Qr({ storeId, storeName }: { storeId: string; storeName?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!storeId) return;
    const navUrl = buildStoreNavUrl(storeId);
    setUrl(navUrl);
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, navUrl, {
        width: 320,
        margin: 2,
        color: { dark: "#0f172a", light: "#ffffff" },
      }).catch(() => {
        // canvas rendering is best-effort; user still has the URL to copy
      });
    }
  }, [storeId]);

  const handleCopy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("QR-länk kopierad");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Kunde inte kopiera länken");
    }
  };

  const handleDownload = () => {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `storeflow-qr-${storeId}.png`;
    a.click();
  };

  const handlePrint = () => {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL("image/png");
    const w = window.open("", "_blank", "width=420,height=560");
    if (!w) {
      toast.error("Tillåt popup-fönster för att skriva ut");
      return;
    }
    w.document.write(`
      <!doctype html>
      <html lang="sv">
        <head>
          <meta charset="utf-8" />
          <title>StoreFlow QR – ${storeName ?? storeId}</title>
          <style>
            body { font-family: system-ui, sans-serif; text-align: center; padding: 24px; }
            h1 { font-size: 18px; margin: 0 0 8px; }
            p { font-size: 12px; color: #475569; margin: 0 0 16px; }
            img { width: 320px; height: 320px; }
            .url { font-size: 11px; word-break: break-all; color: #334155; margin-top: 12px; }
          </style>
        </head>
        <body>
          <h1>${storeName ?? "Din butik"}</h1>
          <p>Skanna för att hitta varor i butiken</p>
          <img src="${dataUrl}" alt="QR-kod" />
          <div class="url">${url}</div>
          <script>window.onload = () => { window.print(); };</script>
        </body>
      </html>
    `);
    w.document.close();
  };

  return (
    <Card className="mx-auto w-full max-w-xl">
      <CardHeader>
        <CardTitle>Butikens QR-kod</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Skriv ut denna QR och placera den i entrén. När kunden skannar koden öppnas
          butikens 3D/AR-kundvy direkt med rätt digital tvilling.
        </p>
        <div className="flex flex-col items-center gap-3 rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={`QR-kod till ${storeName ?? "butiken"}`}
            className="rounded-lg"
          />
          <code className="break-all text-center text-xs text-slate-500">{url}</code>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={handlePrint} className="gap-2">
            <Printer className="h-4 w-4" /> Skriv ut
          </Button>
          <Button onClick={handleDownload} variant="outline" className="gap-2">
            <Download className="h-4 w-4" /> Ladda ner PNG
          </Button>
          <Button onClick={handleCopy} variant="outline" className="gap-2">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Kopierad" : "Kopiera länk"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
