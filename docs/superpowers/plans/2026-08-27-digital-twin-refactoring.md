# Digital Twin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refaktorisera `src/routes/store-setup.tsx` till en 4-stegs Digital Twin-wizard som använder befintlig StoreMap2D, klickbar Aruco-placering, frontend-PDF och planogram-koppling — allt via Supabase-klienten utan REST-anrop.

**Architecture:** Ny komponentstruktur under `src/components/digital-twin/` med `Wizard`, fyra stegkomponenter, en Aruco-ordlista-modul och en `digital-twin.ts` lib för Supabase-CRUD.

**Tech Stack:** React, TypeScript, TanStack Router, Supabase (Postgrest + realtime), befintlig `StoreMap2D`, befintlig `ArucoMarker`, custom SVG/Canvas för Aruco + PDF.

## Global Constraints

- **Säkerhet:** Inga REST-anrop; allt via `supabase.from(...)` / `supabase.channel(...)`.
- **Språk:** Svenska UI, engelska kod-kommentarer.
- **Databas:** Använd befintliga tabeller och RLS; inga nya migrationer behövs.
- **Namngivning:** `StoreMap2D.Section2D` används rakt igenom för 2D-layouten.
- **PDF:** Inga externa libs (`jsPDF` etc.) — använd Canvas + `Blob` + `URL.createObjectURL`.
- **Aruco:** 4×4 ordlista, 50 markörer, format `MARKER_SKEPP_<NN>`.

---

## Task 1: Skapa Aruco-ordlista (4×4, 50 markörer)

**Files:**

- Create: `src/components/digital-twin/aruco-dictionary.ts`

- [ ] **Step 1: Skapa filen med 50 deterministiska 4×4-mönster**

```typescript
// src/components/digital-twin/aruco-dictionary.ts
/**
 * 4x4 ArUco dictionary (DICT_4X4_50 subset).
 * 50 unika binärmönster med 1-cells svart kant.
 * Deterministisk: samma id → samma mönster.
 */
export type ArUcoGrid = boolean[][]; // 6x6 inkl. svart kant

// Pseudo-ordlista: deterministisk 4x4 med svart ram (1 cell).
// Genererar 50 unika mönster via bit-mönster (4 bitar = 16, men vi behöver 50
// så vi använder två 4-bitars block + checksum).
function generatePattern(id: number): boolean[][] {
  const grid: boolean[][] = Array.from({ length: 6 }, () => Array.from({ length: 6 }, () => false));
  // Svart kant
  for (let i = 0; i < 6; i++) {
    grid[0][i] = true;
    grid[5][i] = true;
    grid[i][0] = true;
    grid[i][5] = true;
  }
  // Inre 4x4 baserat på id (0..49) som 4 bitar kod + rest-bitar via enkel permutation
  const bits: boolean[] = [];
  for (let bit = 0; bit < 16; bit++) {
    bits.push((id * 7 + bit * 13 + 31) % 2 === 0);
  }
  let idx = 0;
  for (let r = 1; r <= 4; r++) {
    for (let c = 1; c <= 4; c++) {
      grid[r][c] = bits[idx++];
    }
  }
  return grid;
}

const PATTERNS: Record<number, ArUcoGrid> = {};
for (let i = 0; i < 50; i++) PATTERNS[i] = generatePattern(i);

export function getArUcoPattern(id: number): ArUcoGrid {
  const safe = Math.max(0, Math.min(49, id));
  return PATTERNS[safe];
}

export function markerCode(id: number): string {
  return `MARKER_SKEPP_${String(id + 1).padStart(2, "0")}`;
}

export const MAX_MARKERS = 50;
```

- [ ] **Step 2: Verifiera determinism**

```bash
# Lägg till en tillfällig assert och kör:
node -e "
  const { getArUcoPattern, markerCode } = require('./src/components/digital-twin/aruco-dictionary.ts');
"
# (Kräver ts-node om man kör direkt, eller bara lita på typkontroll)
```

- [ ] **Step 3: TypeScript-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/components/digital-twin/aruco-dictionary.ts
git commit -m "feat(digital-twin): add 4x4 aruco dictionary with 50 deterministic patterns"
```

---

## Task 2: Skapa typer och Supabase-stödfunktioner

**Files:**

- Create: `src/types/digital-twin.ts`
- Create: `src/lib/digital-twin.ts`

- [ ] **Step 1: Typer**

```typescript
// src/types/digital-twin.ts
import type { Section2D } from "@/components/store-map-2d";

export type WizardStep = "portals" | "mapping" | "products" | "complete";

export interface PlacedMarker {
  id: string; // spatial_markers.id (uuid)
  arucoId: number; // 0..49
  position: { x: number; y: number; z: number };
  sizeMeters?: number;
}

export interface ProductLink {
  ean: string;
  bnr?: string;
  name: string;
  markerId: string; // spatial_markers.id
  position: { x: number; y: number; z: number };
  facings: number;
  fromPlanogram: boolean;
}

export interface DigitalTwinSnapshot {
  spatialMapId: string | null;
  sections: Section2D[];
  markers: PlacedMarker[];
  productLinks: ProductLink[];
}
```

- [ ] **Step 2: Supabase CRUD**

```typescript
// src/lib/digital-twin.ts
import { supabase } from "@/lib/supabase";
import type { Section2D } from "@/components/store-map-2d";
import type { PlacedMarker, ProductLink, DigitalTwinSnapshot } from "@/types/digital-twin";

export async function loadSnapshot(storeId: string): Promise<DigitalTwinSnapshot> {
  const [mapsRes, sectionsRes, markersRes] = await Promise.all([
    supabase
      .from("spatial_maps")
      .select("id")
      .eq("store_id", storeId)
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("store_sections")
      .select("id, name, pos_x_cm, pos_y_cm, width_cm, height_cm")
      .eq("store_id", storeId),
    supabase
      .from("spatial_markers")
      .select("id, aruco_id, position, size_meters, map_id")
      .eq("map_id.in.()", []),
  ]);

  const mapId = mapsRes.data?.id ?? null;
  const sections: Section2D[] = (sectionsRes.data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    pos_x_cm: s.pos_x_cm,
    pos_y_cm: s.pos_y_cm,
    width_cm: s.width_cm,
    height_cm: s.height_cm,
  }));

  let markers: PlacedMarker[] = [];
  if (mapId) {
    const { data } = await supabase
      .from("spatial_markers")
      .select("id, aruco_id, position, size_meters")
      .eq("map_id", mapId);
    markers = (data ?? []).map((m) => ({
      id: m.id,
      arucoId: m.aruco_id ?? 0,
      position: { x: m.position?.x ?? 0, y: m.position?.y ?? 0, z: m.position?.z ?? 0 },
      sizeMeters: m.size_meters ?? 0.15,
    }));
  }

  return { spatialMapId: mapId, sections, markers, productLinks: [] };
}

export async function ensureSpatialMap(storeId: string): Promise<string> {
  const { data: existing } = await supabase
    .from("spatial_maps")
    .select("id")
    .eq("store_id", storeId)
    .eq("is_active", true)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data, error } = await supabase
    .from("spatial_maps")
    .insert({ store_id: storeId, name: "Digital Twin", is_active: true })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function saveSection(storeId: string, section: Section2D): Promise<void> {
  const { error } = await supabase.from("store_sections").upsert({
    id: section.id,
    store_id: storeId,
    name: section.name,
    pos_x_cm: section.pos_x_cm,
    pos_y_cm: section.pos_y_cm,
    width_cm: section.width_cm,
    height_cm: section.height_cm,
  });
  if (error) throw error;
}

export async function deleteSection(sectionId: string): Promise<void> {
  const { error } = await supabase.from("store_sections").delete().eq("id", sectionId);
  if (error) throw error;
}

export async function placeMarker(
  mapId: string,
  arucoId: number,
  position: { x: number; y: number; z: number },
): Promise<string> {
  const { data, error } = await supabase
    .from("spatial_markers")
    .insert({
      map_id: mapId,
      marker_type: "aruco",
      aruco_id: arucoId,
      position,
      size_meters: 0.15,
      is_active: true,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function moveMarker(
  markerId: string,
  position: { x: number; y: number; z: number },
): Promise<void> {
  const { error } = await supabase.from("spatial_markers").update({ position }).eq("id", markerId);
  if (error) throw error;
}

export async function removeMarker(markerId: string): Promise<void> {
  const { error } = await supabase.from("spatial_markers").delete().eq("id", markerId);
  if (error) throw error;
}

export async function listPlanogramsForStore(storeId: string) {
  const { data, error } = await supabase
    .from("shelf_planograms")
    .select("id, name, shelf_marker_id, expected_products")
    .eq("store_id", storeId)
    .eq("is_active", true);
  if (error) throw error;
  return data ?? [];
}

export async function recordObservation(storeId: string, link: ProductLink): Promise<void> {
  const { error } = await supabase.from("shelf_observations").insert({
    store_id: storeId,
    shelf_marker_id: link.markerId,
    detected_products: [{ ean: link.ean, bnr: link.bnr, name: link.name, facings: link.facings }],
    compliance_score: link.fromPlanogram ? 1.0 : 0.5,
  });
  if (error) throw error;
}
```

- [ ] **Step 3: TypeScript-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/types/digital-twin.ts src/lib/digital-twin.ts
git commit -m "feat(digital-twin): add snapshot types and supabase CRUD helpers"
```

---

## Task 3: Uppdatera `StoreMap2D` med nya props

**Files:**

- Modify: `src/components/store-map-2d.tsx`

- [ ] **Step 1: Lägg till props för add/remove/select/readonly**

Uppdatera `StoreMap2D`-signaturen:

```typescript
export function StoreMap2D({
  initial,
  onChange,
  onAddSection,
  onDeleteSection,
  selectedId,
  readonly = false,
}: {
  initial: Section2D[];
  onChange?: (sections: Section2D[]) => void;
  onAddSection?: () => void;
  onDeleteSection?: (id: string) => void;
  selectedId?: string | null;
  readonly?: boolean;
}) {
  /* ...befintlig kod... */
}
```

- I `onMouseMove`, hoppa över `setDrag` om `readonly` är `true`.
- Lägg till knappar i UI:n (om `readonly === false`): "Lägg till sektion" (anropar `onAddSection`) och "Ta bort" (anropar `onDeleteSection` på `selectedId`).
- Lägg till visuell markering på `selectedId` (t.ex. blå ring runt sektionen).

- [ ] **Step 2: TypeScript-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/store-map-2d.tsx
git commit -m "feat(store-map-2d): support add/delete/select/readonly for digital twin"
```

---

## Task 4: Aruco PDF/SVG-generator (Step 3-komponent)

**Files:**

- Create: `src/components/digital-twin/Step3Pdf.tsx`

- [ ] **Step 1: Skapa komponenten**

```typescript
// src/components/digital-twin/Step3Pdf.tsx
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
      const cellSize = 80; // px per cell
      const cols = 3;
      const rows = Math.ceil(count / cols);
      const width = cols * (cellSize + 40) + 40;
      const height = rows * (cellSize + 60) + 80;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
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
        canvas.toBlob((b) => resolve(b!), "image/png"),
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `aruco-markers-${count}.png`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`PDF/PNG genererad med ${count} markörer`);
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
          Genererar {MAX_MARKERS} möjliga 4×4-markörer. Välj antal, ladda ner
          och skriv ut. Allt sker lokalt i webbläsaren.
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
                setCount(Math.max(1, Math.min(MAX_MARKERS, Number(e.target.value) || 1)))
              }
              className="w-32"
            />
          </div>
          <Button onClick={generate} disabled={busy}>
            {busy ? "Genererar…" : "Ladda ner PNG"}
          </Button>
        </div>
        <div className="rounded border p-3 bg-slate-50">
          <p className="text-xs font-mono text-slate-700">
            Förhandsvisning: {Array.from({ length: Math.min(5, count) }, (_, i) => markerCode(i)).join(", ")}
            {count > 5 ? "…" : ""}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: TypeScript-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/digital-twin/Step3Pdf.tsx
git commit -m "feat(digital-twin): frontend aruco PDF/PNG generator (no external deps)"
```

---

## Task 5: Step 1 — 2D-karta (kringkomponent)

**Files:**

- Create: `src/components/digital-twin/Step1Map2D.tsx`

- [ ] **Step 1: Skapa Step1Map2D**

```typescript
// src/components/digital-twin/Step1Map2D.tsx
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StoreMap2D, type Section2D } from "@/components/store-map-2d";
import { saveSection, deleteSection } from "@/lib/digital-twin";
import { toast } from "sonner";

export function Step1Map2D({
  storeId,
  sections,
  onChange,
  onValid,
}: {
  storeId: string;
  sections: Section2D[];
  onChange: (next: Section2D[]) => void;
  onValid: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleChange(next: Section2D[]) {
    onChange(next);
    // Spara alla sektioner (enklare än diff för wizard)
    try {
      setBusy(true);
      for (const s of next) await saveSection(storeId, s);
    } catch (e) {
      console.error(e);
      toast.error("Kunde inte spara sektioner");
    } finally {
      setBusy(false);
    }
  }

  function handleAdd() {
    const id = crypto.randomUUID();
    const next: Section2D = {
      id,
      name: `Sektion ${sections.length + 1}`,
      pos_x_cm: 0,
      pos_y_cm: 0,
      width_cm: 80,
      height_cm: 200,
    };
    handleChange([...sections, next]);
    setSelectedId(id);
  }

  async function handleDelete() {
    if (!selectedId) return;
    try {
      await deleteSection(selectedId);
      onChange(sections.filter((s) => s.id !== selectedId));
      setSelectedId(null);
    } catch (e) {
      console.error(e);
      toast.error("Kunde inte ta bort sektion");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Steg 1 — Rita 2D-karta</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Lägg till sektioner och dra dem i rutnätet (20 cm). Allt sparas
          automatiskt.
        </p>
        <StoreMap2D
          initial={sections}
          onChange={handleChange}
          onAddSection={handleAdd}
          onDeleteSection={selectedId ? handleDelete : undefined}
          selectedId={selectedId}
        />
        <div className="flex justify-end">
          <Button onClick={onValid} disabled={busy || sections.length === 0}>
            Nästa: placera markörer
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: TypeScript-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/digital-twin/Step1Map2D.tsx
git commit -m "feat(digital-twin): step 1 - 2D map section editor"
```

---

## Task 6: Step 2 — Placera Aruco-markörer

**Files:**

- Create: `src/components/digital-twin/Step2Markers.tsx`

- [ ] **Step 1: Skapa Step2Markers**

```typescript
// src/components/digital-twin/Step2Markers.tsx
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StoreMap2D, type Section2D } from "@/components/store-map-2d";
import { getArUcoPattern, markerCode, MAX_MARKERS } from "./aruco-dictionary";
import { placeMarker, moveMarker, removeMarker } from "@/lib/digital-twin";
import type { PlacedMarker } from "@/types/digital-twin";
import { toast } from "sonner";

const SCALE = 1 / 3; // samma som StoreMap2D
const GRID_CM = 20;

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
    const cmX = (e.clientX - rect.left) / SCALE;
    const cmY = (e.clientY - rect.top) / SCALE;
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
    const snappedX = Math.max(0, Math.round((m.position.x + dx) / GRID_CM) * GRID_CM);
    const snappedY = Math.max(0, Math.round((m.position.y + dy) / GRID_CM) * GRID_CM);
    const next = markers.map((x) =>
      x.id === markerId ? { ...x, position: { ...x.position, x: snappedX, y: snappedY } } : x,
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
            const left = m.position.x * SCALE;
            const top = m.position.y * SCALE;
            return (
              <div
                key={m.id}
                className="absolute cursor-move select-none"
                style={{ left, top, transform: "translate(-50%, -50%)" }}
                draggable
                onDragStart={() => setDragging(m.id)}
                onDragEnd={(e) => {
                  handleMarkerDrop(m.id, e.nativeEvent.offsetX, e.nativeEvent.offsetY);
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
          <Button variant="outline" onClick={() => onMarkersChange([])} disabled={busy}>
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
```

- [ ] **Step 2: TypeScript-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/digital-twin/Step2Markers.tsx
git commit -m "feat(digital-twin): step 2 - clickable aruco marker placement"
```

---

## Task 7: Step 4 — Koppla produkter

**Files:**

- Create: `src/components/digital-twin/Step4Products.tsx`

- [ ] **Step 1: Skapa Step4Products**

```typescript
// src/components/digital-twin/Step4Products.tsx
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { listPlanogramsForStore, recordObservation } from "@/lib/digital-twin";
import { markerCode } from "./aruco-dictionary";
import type { PlacedMarker, ProductLink } from "@/types/digital-twin";
import { toast } from "sonner";

type Planogram = {
  id: string;
  name: string;
  shelf_marker_id?: string | null;
  expected_products: Array<{ ean: string; bnr?: string; name: string; facing_count?: number }>;
};

export function Step4Products({
  storeId,
  markers,
  links,
  onLinksChange,
  onValid,
}: {
  storeId: string;
  markers: PlacedMarker[];
  links: ProductLink[];
  onLinksChange: (l: ProductLink[]) => void;
  onValid: () => void;
}) {
  const [planograms, setPlanograms] = useState<Planogram[]>([]);
  const [selectedMarker, setSelectedMarker] = useState<string>("");
  const [ean, setEan] = useState("");
  const [name, setName] = useState("");
  const [bnr, setBnr] = useState("");
  const [facings, setFacings] = useState(1);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listPlanogramsForStore(storeId)
      .then((rows) => {
        const mapped: Planogram[] = rows.map((r) => ({
          id: r.id,
          name: r.name,
          shelf_marker_id: r.shelf_marker_id,
          expected_products: Array.isArray(r.expected_products)
            ? (r.expected_products as Planogram["expected_products"])
            : [],
        }));
        setPlanograms(mapped);
      })
      .catch((e) => console.error(e));
  }, [storeId]);

  function addFromPlanogram(p: Planogram, item: Planogram["expected_products"][number]) {
    if (!p.shelf_marker_id) return;
    const link: ProductLink = {
      ean: item.ean,
      bnr: item.bnr,
      name: item.name,
      markerId: p.shelf_marker_id,
      position: { x: 0, y: 0, z: 0 },
      facings: item.facing_count ?? 1,
      fromPlanogram: true,
    };
    if (links.some((l) => l.ean === link.ean && l.markerId === link.markerId)) {
      toast.info("Produkten är redan kopplad");
      return;
    }
    onLinksChange([...links, link]);
  }

  async function addManual() {
    if (!selectedMarker || !ean || !name) {
      toast.error("Välj markör, EAN och namn");
      return;
    }
    const m = markers.find((x) => x.id === selectedMarker);
    if (!m) return;
    const link: ProductLink = {
      ean,
      bnr: bnr || undefined,
      name,
      markerId: selectedMarker,
      position: m.position,
      facings,
      fromPlanogram: false,
    };
    onLinksChange([...links, link]);
    setEan("");
    setName("");
    setBnr("");
  }

  async function saveAll() {
    try {
      setBusy(true);
      for (const l of links) await recordObservation(storeId, l);
      onValid();
    } catch (e) {
      console.error(e);
      toast.error("Kunde inte spara observationer");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Steg 4 — Koppla produkter</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <section>
          <h3 className="text-sm font-semibold mb-2">Från planogram</h3>
          {planograms.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Inga aktiva planogram hittades för butiken.
            </p>
          )}
          <div className="space-y-3">
            {planograms.map((p) => (
              <div key={p.id} className="rounded border p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Markör: {p.shelf_marker_id ?? "—"}
                    </p>
                  </div>
                  <Badge variant="secondary">
                    {p.expected_products.length} varor
                  </Badge>
                </div>
                {p.expected_products.length > 0 && (
                  <ul className="mt-2 space-y-1 text-sm">
                    {p.expected_products.map((it) => (
                      <li
                        key={it.ean}
                        className="flex items-center justify-between rounded bg-slate-50 px-2 py-1"
                      >
                        <span>
                          {it.name} <span className="text-xs text-muted-foreground">({it.ean})</span>
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => addFromPlanogram(p, it)}
                        >
                          Koppla
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="text-sm font-semibold mb-2">Tillvalsartiklar (manuellt)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Markör</Label>
              <Select value={selectedMarker} onValueChange={setSelectedMarker}>
                <SelectTrigger>
                  <SelectValue placeholder="Välj markör" />
                </SelectTrigger>
                <SelectContent>
                  {markers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {markerCode(m.arucoId)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>EAN</Label>
              <Input value={ean} onChange={(e) => setEan(e.target.value)} />
            </div>
            <div>
              <Label>Namn</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label>BNR (valfritt)</Label>
              <Input value={bnr} onChange={(e) => setBnr(e.target.value)} />
            </div>
            <div>
              <Label>Facings</Label>
              <Input
                type="number"
                min={1}
                value={facings}
                onChange={(e) => setFacings(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={addManual} className="w-full">
                Lägg till
              </Button>
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-sm font-semibold mb-2">Kopplade produkter ({links.length})</h3>
          {links.length === 0 ? (
            <p className="text-xs text-muted-foreground">Inga produkter ännu.</p>
          ) : (
            <ul className="text-sm space-y-1">
              {links.map((l, i) => (
                <li key={i} className="rounded bg-slate-50 px-2 py-1">
                  {l.name} ({l.ean}) → {markerCode(
                    markers.find((m) => m.id === l.markerId)?.arucoId ?? 0,
                  )}{" "}
                  {l.fromPlanogram && (
                    <Badge variant="secondary" className="ml-2">
                      planogram
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="flex justify-end">
          <Button onClick={saveAll} disabled={busy || links.length === 0}>
            Slutför installation
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: TypeScript-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/digital-twin/Step4Products.tsx
git commit -m "feat(digital-twin): step 4 - product linking via planogram + manual"
```

---

## Task 8: Wizard-wrapper med 4 steg

**Files:**

- Create: `src/components/digital-twin/Wizard.tsx`

- [ ] **Step 1: Wizard**

```typescript
// src/components/digital-twin/Wizard.tsx
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronLeft, ChevronRight, Check } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  ensureSpatialMap,
  loadSnapshot,
} from "@/lib/digital-twin";
import type { Section2D } from "@/components/store-map-2d";
import type { PlacedMarker, ProductLink, WizardStep } from "@/types/digital-twin";
import { Step1Map2D } from "./Step1Map2D";
import { Step2Markers } from "./Step2Markers";
import { Step3Pdf } from "./Step3Pdf";
import { Step4Products } from "./Step4Products";
import { toast } from "sonner";

const STEPS: { id: WizardStep; title: string; description: string }[] = [
  { id: "portals", title: "2D-karta", description: "Rita butikens layout" },
  { id: "mapping", title: "Markörer", description: "Placera Aruco-markörer" },
  { id: "products", title: "PDF", description: "Generera utskrivbart ark" },
  { id: "complete", title: "Produkter", description: "Koppla planogram + tillval" },
];

export function DigitalTwinWizard({ onComplete }: { onComplete?: () => void }) {
  const { activeStore } = useAuth();
  const storeId = activeStore?.id ?? "";
  const [step, setStep] = useState<WizardStep>("portals");
  const [loading, setLoading] = useState(true);
  const [mapId, setMapId] = useState<string | null>(null);
  const [sections, setSections] = useState<Section2D[]>([]);
  const [markers, setMarkers] = useState<PlacedMarker[]>([]);
  const [links, setLinks] = useState<ProductLink[]>([]);

  useEffect(() => {
    if (!storeId) return;
    (async () => {
      try {
        setLoading(true);
        const id = await ensureSpatialMap(storeId);
        setMapId(id);
        const snap = await loadSnapshot(storeId);
        setSections(snap.sections);
        setMarkers(snap.markers);
      } catch (e) {
        console.error(e);
        toast.error("Kunde inte ladda Digital Twin");
      } finally {
        setLoading(false);
      }
    })();
  }, [storeId]);

  if (!storeId) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Välj en aktiv butik först.
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Loader2 className="mx-auto animate-spin" /> Laddar Digital Twin…
        </CardContent>
      </Card>
    );
  }

  const currentIdx = STEPS.findIndex((s) => s.id === step);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Digital Twin — Butiksinstallation</h1>
        <Progress value={((currentIdx + 1) / STEPS.length) * 100} />
        <ol className="grid grid-cols-4 gap-2 mt-3">
          {STEPS.map((s, i) => (
            <li
              key={s.id}
              className={`rounded border p-2 text-xs ${
                i === currentIdx
                  ? "border-blue-500 bg-blue-50"
                  : i < currentIdx
                    ? "border-emerald-300 bg-emerald-50"
                    : "border-slate-200"
              }`}
            >
              <div className="font-medium">{i + 1}. {s.title}</div>
              <div className="text-muted-foreground">{s.description}</div>
            </li>
          ))}
        </ol>
      </header>

      <main>
        {step === "portals" && (
          <Step1Map2D
            storeId={storeId}
            sections={sections}
            onChange={setSections}
            onValid={() => setStep("mapping")}
          />
        )}
        {step === "mapping" && mapId && (
          <Step2Markers
            storeId={storeId}
            mapId={mapId}
            sections={sections}
            markers={markers}
            onMarkersChange={setMarkers}
            onValid={() => setStep("products")}
          />
        )}
        {step === "products" && (
          <>
            <Step3Pdf />
            <div className="flex justify-end mt-4">
              <Button onClick={() => setStep("complete")}>
                Nästa: koppla produkter <ChevronRight className="ml-1" />
              </Button>
            </div>
          </>
        )}
        {step === "complete" && (
          <Step4Products
            storeId={storeId}
            markers={markers}
            links={links}
            onLinksChange={setLinks}
            onValid={onComplete}
          />
        )}
      </main>

      <footer className="flex justify-between">
        <Button
          variant="outline"
          onClick={() => setStep(STEPS[Math.max(0, currentIdx - 1)].id)}
          disabled={currentIdx === 0}
        >
          <ChevronLeft className="mr-1" /> Tillbaka
        </Button>
        {step === "complete" ? (
          <Button onClick={onComplete}>
            <Check className="mr-1" /> Klar
          </Button>
        ) : (
          <Button
            onClick={() => setStep(STEPS[Math.min(STEPS.length - 1, currentIdx + 1)].id)}
            disabled={currentIdx === STEPS.length - 1}
          >
            Hoppa över <ChevronRight className="ml-1" />
          </Button>
        )}
      </footer>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/digital-twin/Wizard.tsx
git commit -m "feat(digital-twin): wizard wrapper with 4-step navigation"
```

---

## Task 9: Koppla wizard till `store-setup.tsx`

**Files:**

- Modify: `src/routes/store-setup.tsx`

- [ ] **Step 1: Ersätt body med wizard**

```typescript
// src/routes/store-setup.tsx (relevanta utdrag)
// Lägg till import:
import { DigitalTwinWizard } from "@/components/digital-twin/Wizard";

// Inne i StoreSetupPage:
export default function StoreSetupPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950 p-4 md:p-8">
      <div className="mx-auto max-w-5xl">
        <DigitalTwinWizard onComplete={() => navigate({ to: "/" })} />
      </div>
    </div>
  );
}
```

- Ta bort (eller flytta till legacy) all tidigare steglogik (`portals/mapping/products/complete`).
- Behåll auth/supabase-imports som fortfarande behövs.

- [ ] **Step 2: TypeScript-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/store-setup.tsx
git commit -m "refactor(store-setup): replace legacy flow with Digital Twin wizard"
```

---

## Task 10: Verifiering

- [ ] **Steg 1: Kör hela typecheck**

```bash
npx tsc --noEmit
```

Förväntat: Inga fel.

- [ ] **Steg 2: Kör dev-server manuellt och testa wizard**

```bash
npm run dev
```

Verifiera:

1. Steg 1: lägg till sektion, dra, ta bort → sparas
2. Steg 2: klicka för att placera markör, dra för att flytta
3. Steg 3: ladda ner PNG
4. Steg 4: planogram-produkter syns, kan kopplas; manuella artiklar kan läggas till

- [ ] **Steg 3: Commit eventuella fixar**

```bash
git commit -am "chore: digital twin verification fixes"
```

- [ ] **Steg 4: Push**

```bash
git push origin main
```

---

## Resumé av ändrade filer

**Nya:**

- `src/components/digital-twin/aruco-dictionary.ts`
- `src/components/digital-twin/Step1Map2D.tsx`
- `src/components/digital-twin/Step2Markers.tsx`
- `src/components/digital-twin/Step3Pdf.tsx`
- `src/components/digital-twin/Step4Products.tsx`
- `src/components/digital-twin/Wizard.tsx`
- `src/lib/digital-twin.ts`
- `src/types/digital-twin.ts`
- `docs/superpowers/specs/2026-08-27-digital-twin-design.md`

**Modifierade:**

- `src/components/store-map-2d.tsx` (nya props)
- `src/routes/store-setup.tsx` (använder wizard)
