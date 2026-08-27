/**
 * Light frontend-based ArUco code / PDF generator.
 * Uses Canvas + Blob (no external API dependencies, no jsPDF).
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { getArUcoPattern, markerCode, MAX_MARKERS } from "./aruco-dictionary";

export function Step3Pdf() {
  const [count, setCount] = useState(10);
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    try {
      const cellSize = 80; // px per cell (6x6 grid = 6*cellSize)
      const cols = 3;
      const rows = Math.ceil(count / cols);
      const width = cols * (cellSize + 40) + 40;
      const height = rows * (cellSize + 60) + 80;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No canvas context");

      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "black";
      ctx.font = "bold 14px sans-serif";

      for (let i = 0; i < count; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const ox = 20 + col * (cellSize + 40);
        const oy = 60 + row * (cellSize + 60);
        const pattern = getArUcoPattern(i);
        const cell = cellSize / 6;
        for (let r = 0; r < 6; r++) {
          for (let c = 0; c < 6; c++) {
            ctx.fillStyle = pattern[r][c] ? "black" : "white";
            ctx.fillRect(ox + c * cell, oy + r * cell, cell, cell);
          }
        }
        ctx.fillStyle = "black";
        ctx.fillText(markerCode(i), ox, oy - 8);
      }

      const blob: Blob = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b!), "image/png")
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `aruco-markers-${count}.png`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`PNG-ark genererad med ${count} markörer`);
    } catch (e) {
      console.error(e);
      toast.error("Kunde inte generera PDF");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Steg 3 — Generera Aruco-ark</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Genererar {MAX_MARKERS} möjliga 4×4-markörer. Välj antal och ladda ned.
          Allt sker lokalt i webbläsaren utan externa API-beroenden.
        </p>
        <div className="flex items-end gap-3">
          <div>
            <Label htmlFor="count">Antal markörer</Label>
            <Input
              id="count"
              type="number"
              min={1}
              max={MAX_MARKERS}
              value={count}
              onChange={(e) =>
                setCount(
                  Math.max(1, Math.min(MAX_MARKERS, Number(e.target.value) || 1))
                )
              }
              className="w-32"
            />
          </div>
          <Button onClick={generate} disabled={busy} className="w-full">
            {busy ? "Genererar..." : "Ladda ner PNG"}
          </Button>
        </div>
        <div className="rounded border p-3 bg-slate-50">
          <p className="text-xs font-mono text-slate-700">
            Förhandsvisning: {Array.from({ length: Math.min(5, count) }, (_, i) => markerCode(i)).join(", ")}
            {count > 5 ? " …" : ""}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
