/**
 * 2D drag&drop grid for store sections.
 * - Sektioner klickas in och dras för att skapa en visuell karta över butiken.
 * - Standardmått: 80×200×60 cm. Grid-rastret är 20 cm.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";

export type Section2D = {
  id: string;
  name: string;
  pos_x_cm: number;
  pos_y_cm: number;
  width_cm: number;
  height_cm: number;
  rotation_deg?: number;
};

const GRID_CM = 20;
const SCALE = 1 / 3; // 1cm -> 1/3 px på skärmen

export function StoreMap2D({
  initial,
  onChange,
  onAddSection,
  onDeleteSection,
  selectedId,
  readonly,
}: {
  initial: Section2D[];
  onChange?: (sections: Section2D[]) => void | Promise<void>;
  onAddSection?: () => void;
  onDeleteSection?: () => Promise<void> | void;
  selectedId?: string | null;
  readonly?: boolean;
}) {
  const [sections, setSections] = useState<Section2D[]>(initial);
  const [drag, setDrag] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const isReadonly = readonly ?? false;

  function onMouseDown(e: React.MouseEvent, s: Section2D) {
    if (isReadonly) return;
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDrag({
      id: s.id,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
    });
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!drag || isReadonly) return;
    const container = e.currentTarget.getBoundingClientRect();

    // Beräkna x och y med snap-to-grid baserat på GRID_CM
    const rawX = (e.clientX - container.left - drag.offsetX) / SCALE;
    const rawY = (e.clientY - container.top - drag.offsetY) / SCALE;

    const x = Math.round(rawX / GRID_CM) * GRID_CM;
    const y = Math.round(rawY / GRID_CM) * GRID_CM;

    setSections((prev) => {
      const next = prev.map((s) =>
        s.id === drag.id ? { ...s, pos_x_cm: Math.max(0, x), pos_y_cm: Math.max(0, y) } : s,
      );
      onChange?.(next);
      return next;
    });
  }

  const gridPixelSize = GRID_CM * SCALE; // Exakt storlek på en grid-ruta i pixlar

  return (
    <div
      onMouseMove={onMouseMove}
      onMouseUp={() => setDrag(null)}
      onMouseLeave={() => setDrag(null)}
      className="relative h-[600px] w-full overflow-auto rounded-md border bg-white select-none"
      style={{
        backgroundImage:
          "linear-gradient(to right, #E2D8CA 1px, transparent 1px), linear-gradient(to bottom, #E2D8CA 1px, transparent 1px)",
        backgroundSize: `${gridPixelSize}px ${gridPixelSize}px`,
      }}
    >
      {onAddSection && (
        <Button
          size="sm"
          className="absolute top-2 left-2 z-10"
          onClick={onAddSection}
          disabled={isReadonly}
        >
          <Plus className="w-4 h-4 mr-1" /> Lägg till sektion
        </Button>
      )}
      {onDeleteSection && selectedId && (
        <Button
          size="sm"
          variant="destructive"
          className="absolute top-2 right-2 z-10"
          onClick={() => onDeleteSection?.()}
          disabled={isReadonly}
        >
          <Trash2 className="w-4 h-4 mr-1" /> Ta bort
        </Button>
      )}
      {sections.map((s) => (
        <div
          key={s.id}
          onMouseDown={(e) => onMouseDown(e, s)}
          className={`
            absolute
            ${isReadonly ? "cursor-default" : "cursor-move"}
            rounded
            border
            ${s.id === selectedId ? "border-primary" : "border-border"}
            bg-coop-gron-100/80
            p-1
            text-xs
            font-medium
            text-coop-gron-800
            shadow-sm
            transition-shadow
            hover:shadow-md
            group
          `}
          style={{
            left: s.pos_x_cm * SCALE,
            top: s.pos_y_cm * SCALE,
            width: s.width_cm * SCALE,
            height: s.height_cm * SCALE,
            transform: `rotate(${s.rotation_deg ?? 0}deg)`,
            transformOrigin: "center center",
          }}
        >
          <input
            type="text"
            value={s.name}
            disabled={isReadonly}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => {
              const next = sections.map((x) => (x.id === s.id ? { ...x, name: e.target.value } : x));
              setSections(next);
              onChange?.(next);
            }}
            className="w-full bg-transparent border-none outline-none text-coop-gron-900 font-medium text-xs p-0 focus:ring-1 focus:ring-primary rounded"
          />
          {!isReadonly && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const next = sections.map((x) =>
                  x.id === s.id ? { ...x, rotation_deg: ((x.rotation_deg ?? 0) + 90) % 360 } : x,
                );
                setSections(next);
                onChange?.(next);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 bg-white border border-primary text-primary rounded-full w-5 h-5 text-[10px] flex items-center justify-center shadow hover:bg-primary/10"
              title="Rotera 90°"
            >
              ↻
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
