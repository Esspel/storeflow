import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StoreMap2D, type Section2D } from "@/components/store-map-2d";
import { getArUcoPattern, markerCode, MAX_MARKERS } from "./aruco-dictionary";
import { placeMarker, moveMarker, removeMarker } from "@/lib/digital-twin";
import type { PlacedMarker } from "@/types/digital-twin";
import { toast } from "sonner";

export function Step2Markers({
  storeId,
  mapId,
  sections,
  markers,
  onMarkersChange,
  onValid,
}: {
  storeId: string;
  mapId: string;
  sections: Section2D[];
  markers: PlacedMarker[];
  onMarkersChange: (m: PlacedMarker[]) => void;
  onValid: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);

  function findFreeArucoId(): number {
    const used = new Set(markers.map((m) => m.arucoId));
    for (let i = 0; i < MAX_MARKERS; i++) if (!used.has(i)) return i;
    return -1;
  }

  async function handleMapClick(e: React.MouseEvent<HTMLDivElement>) {
    if (dragging) return;
    if (markers.length >= MAX_MARKERS) {
      toast.error("Max 50 markörer");
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const cmX = (e.clientX - rect.left) / (1 / 3);
    const cmY = (e.clientY - rect.top) / (1 / 3);
    const arucoId = findFreeArucoId();
    if (arucoId < 0) return;
    try {
      setBusy(true);
      const id = await placeMarker(mapId, arucoId, { x: cmX, y: cmY, z: 0 });
      onMarkersChange([
        ...markers,
        { id, arucoId, position: { x: cmX, y: cmY, z: 0 } },
      ]);
    } catch (err) {
      console.error(err);
      toast.error("Kunde inte placera markör");
    } finally {
      setBusy(false);
    }
  }

  async function handleMarkerDrop(
    markerId: string,
    dx: number,
    dy: number,
  ) {
    const m = markers.find((x) => x.id === markerId);
    if (!m) return;
    const snappedX = Math.max(
      0,
      Math.round((m.position.x + dx) / 20) * 20,
    );
    const snappedY = Math.max(
      0,
      Math.round((m.position.y + dy) / 20) * 20,
    );
    const next = markers.map((x) =>
      x.id === markerId
        ? { ...x, position: { ...x.position, x: snappedX, y: snappedY } }
        : x,
    );
    onMarkersChange(next);
    try {
      await moveMarker(markerId, { ...m.position, x: snappedX, y: snappedY });
    } catch (err) {
      console.error(err);
      toast.error("Kunde inte flytta markör");
    }
  }

  async function handleRemove(markerId: string) {
    try {
      await removeMarker(markerId);
      onMarkersChange(markers.filter((m) => m.id !== markerId));
    } catch (err) {
      console.error(err);
      toast.error("Kunde inte ta bort markör");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Steg 2 — Placera Aruco-markörer</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Klicka på kartan för att placera en ny markör. Dra för att flytta.
          Totalt {markers.length}/{MAX_MARKERS}.
        </p>

        <div className="relative" onClick={handleMapClick}>
          <StoreMap2D initial={sections} readonly />
          {markers.map((m) => {
            const left = m.position.x * (1 / 3);
            const top = m.position.y * (1 / 3);
            return (
              <div
                key={m.id}
                className="absolute cursor-move select-none"
                style={{ left, top, transform: "translate(-50%, -50%)" }}
                draggable
                onDragStart={() => setDragging(m.id)}
                onDragEnd={(e) => {
                  handleMarkerDrop(
                    m.id,
                    e.nativeEvent.offsetX,
                    e.nativeEvent.offsetY,
                  );
                  setDragging(null);
                }}
                onClick={(e) => e.stopPropagation()}
                title={markerCode(m.arucoId)}
              >
                <ArUcoMini id={m.arucoId} />
              </div>
            );
          })}
        </div>

        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={() => onMarkersChange([])}
            disabled={busy}
          >
            Rensa alla
          </Button>
          <Button onClick={onValid} disabled={busy || markers.length === 0}>
            Nästa: generera PDF
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ArUcoMini({ id }: { id: number }) {
  const grid = getArUcoPattern(id);
  return (
    <div className="rounded shadow ring-1 ring-slate-300 bg-white p-1">
      <div className="grid grid-cols-6 gap-0">
        {grid.flat().map((on, i) => (
          <div
            key={i}
            className="w-2 h-2"
            style={{ background: on ? "#000" : "#fff" }}
          />
        ))}
      </div>
      <div className="text-[8px] text-center mt-1 font-mono">
        {markerCode(id)}
      </div>
    </div>
  );
}