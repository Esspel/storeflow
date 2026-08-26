/**
 * 2D drag&drop grid for store sections.
 * - Sektioner klickas in och dras för att skapa en visuell karta.
 * - Standardmått: 80×200×60 cm. Grid-rastret är 20 cm.
 */
import { useState } from "react";

export type Section2D = {
  id: string;
  namn: string;
  pos_x_cm: number;
  pos_y_cm: number;
  bredd_cm: number;
  höjd_cm: number;
};

const GRID_CM = 20;
const SCALE = 1 / 3; // 1cm -> 1/3 px for screen

export function StoreMap2D({
  initial,
  onChange,
}: {
  initial: Section2D[];
  onChange?: (sections: Section2D[]) => void;
}) {
  const [sections, setSections] = useState<Section2D[]>(initial);
  const [drag, setDrag] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);

  function onMouseDown(e: React.MouseEvent, s: Section2D) {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDrag({
      id: s.id,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
    });
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!drag) return;
    const container = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - container.left - drag.offsetX) / SCALE) / GRID_CM) * GRID_CM;
    const y = Math.round(((e.clientY - container.top - drag.offsetY) / SCALE) / GRID_CM) * GRID_CM;
    setSections((prev) => {
      const next = prev.map((s) =>
        s.id === drag.id ? { ...s, pos_x_cm: Math.max(0, x), pos_y_cm: Math.max(0, y) } : s
      );
      onChange?.(next);
      return next;
    });
  }

  return (
    <div
      onMouseMove={onMouseMove}
      onMouseUp={() => setDrag(null)}
      onMouseLeave={() => setDrag(null)}
      className="relative h-[600px] overflow-auto rounded-md border bg-white"
      style={{
        backgroundImage:
          "linear-gradient(to right, #eee 1px, transparent 1px), linear-gradient(to bottom, #eee 1px, transparent 1px)",
        backgroundSize: `${GRID_CM * SCALE * 3}px ${GRID_CM * SCALE * 3}px`,
      }}
    >
      {sections.map((s) => (
        <div
          key={s.id}
          onMouseDown={(e) => onMouseDown(e, s)}
          className="absolute cursor-move select-none rounded border border-blue-400 bg-blue-100 p-2 text-xs"
          style={{
            left: s.pos_x_cm * SCALE,
            top: s.pos_y_cm * SCALE,
            width: s.bredd_cm * SCALE,
            height: s.höjd_cm * SCALE,
          }}
        >
          {s.namn}
        </div>
      ))}
    </div>
  );
}
