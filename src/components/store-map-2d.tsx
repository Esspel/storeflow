/**
 * 2D drag&drop grid for store sections.
 * - Sektioner klickas in och dras för att skapa en visuell karta över butiken.
 * - Standardmått: 80×200×60 cm. Grid-rastret är 20 cm.
 */
import { useState } from "react";

export type Section2D = {
  id: string;
  name: string;
  pos_x_cm: number;
  pos_y_cm: number;
  width_cm: number;
  height_cm: number;
};

const GRID_CM = 20;
const SCALE = 1 / 3; // 1cm -> 1/3 px på skärmen

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
    
    // Beräkna x och y med snap-to-grid baserat på GRID_CM
    const rawX = (e.clientX - container.left - drag.offsetX) / SCALE;
    const rawY = (e.clientY - container.top - drag.offsetY) / SCALE;

    const x = Math.round(rawX / GRID_CM) * GRID_CM;
    const y = Math.round(rawY / GRID_CM) * GRID_CM;

    setSections((prev) => {
      const next = prev.map((s) =>
        s.id === drag.id ? { ...s, pos_x_cm: Math.max(0, x), pos_y_cm: Math.max(0, y) } : s
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
          "linear-gradient(to right, #e5e7eb 1px, transparent 1px), linear-gradient(to bottom, #e5e7eb 1px, transparent 1px)",
        backgroundSize: `${gridPixelSize}px ${gridPixelSize}px`,
      }}
    >
      {sections.map((s) => (
        <div
          key={s.id}
          onMouseDown={(e) => onMouseDown(e, s)}
          className="absolute cursor-move rounded border border-blue-500 bg-blue-100/80 p-1 text-xs font-medium text-blue-900 shadow-sm transition-shadow hover:shadow-md"
          style={{
            left: s.pos_x_cm * SCALE,
            top: s.pos_y_cm * SCALE,
            width: s.width_cm * SCALE,
            height: s.height_cm * SCALE,
          }}
        >
          {s.name}
        </div>
      ))}
    </div>
  );
}