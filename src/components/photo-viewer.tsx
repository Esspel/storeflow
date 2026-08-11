import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  images: string[];
  initialIndex?: number;
  onClose: () => void;
}

export function PhotoViewer({ images, initialIndex = 0, onClose }: Props) {
  const [idx, setIdx] = useState(() => Math.max(0, Math.min(initialIndex, images.length - 1)));
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Lås scroll på body när bildvisaren är öppen
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  // Flytta fokus in i dialogen när den öppnas och återställ till utlösaren när den stängs
  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => {
      previouslyFocusedRef.current?.focus?.();
    };
  }, []);

  // Tangentbordsnavigering (Escape, Vänster, Höger)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      } else if (e.key === "ArrowLeft") {
        setIdx((i) => Math.max(0, i - 1));
      } else if (e.key === "ArrowRight") {
        setIdx((i) => Math.min(images.length - 1, i + 1));
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [images.length, onClose]);

  const prev = () => setIdx((i) => Math.max(0, i - 1));
  const next = () => setIdx((i) => Math.min(images.length - 1, i + 1));

  // Touch & Gesture-hantering för mobila enheter
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    touchStart.current = null;

    // Swipe nedåt för att stänga
    if (dy > 80 && Math.abs(dx) < Math.abs(dy)) {
      onClose();
      return;
    }

    // Swipe åt sidorna för bildbyte
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) next();
      else prev();
    }
  };

  if (!images || images.length === 0) return null;

  const content = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Bildvisare"
      ref={dialogRef}
      tabIndex={-1}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/95 select-none touch-none outline-none animate-in fade-in-0 duration-150 motion-reduce:animate-none"
    >
      {/* Bakgrundsyta som stänger vid klick */}
      <div onClick={onClose} className="absolute inset-0 z-0" aria-hidden="true" />

      {/* Stäng-knapp */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Stäng bildvisare"
        className="absolute top-4 right-4 z-20 flex h-12 w-12 items-center justify-center rounded-full border border-white/30 bg-white/15 text-white transition-opacity hover:bg-white/25 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <X className="h-6 w-6" />
      </button>

      {/* Bildräknare */}
      {images.length > 1 && (
        <div className="absolute top-5 left-1/2 z-20 -translate-x-1/2 text-sm font-medium text-white/75 pointer-events-none">
          {idx + 1} / {images.length}
        </div>
      )}

      {/* Huvudbild */}
      <img
        key={idx}
        src={images[idx]}
        alt={`Bild ${idx + 1} av ${images.length}`}
        draggable={false}
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 max-h-[85dvh] max-w-[calc(100vw-4rem)] rounded-lg object-contain shadow-2xl transition-all duration-200 md:max-w-[calc(100vw-6rem)]"
      />

      {/* Navigationsknappar (Föregående / Nästa) */}
      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              prev();
            }}
            disabled={idx === 0}
            aria-label="Föregående bild"
            className={cn(
              "absolute left-3 top-1/2 z-20 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-white/15 text-white transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
              idx === 0
                ? "cursor-default opacity-30 text-white/30"
                : "cursor-pointer hover:bg-white/25",
            )}
          >
            <ChevronLeft className="h-6 w-6" />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              next();
            }}
            disabled={idx === images.length - 1}
            aria-label="Nästa bild"
            className={cn(
              "absolute right-3 top-1/2 z-20 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-white/15 text-white transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
              idx === images.length - 1
                ? "cursor-default opacity-30 text-white/30"
                : "cursor-pointer hover:bg-white/25",
            )}
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      )}

      {/* Indikatorpunkter (Dots) */}
      {images.length > 1 && (
        <div className="absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 gap-1.5 pointer-events-none">
          {images.map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-2 rounded-full transition-all duration-200",
                i === idx ? "w-5 bg-white" : "w-2 bg-white/40",
              )}
            />
          ))}
        </div>
      )}
    </div>
  );

  return createPortal(content, document.body);
}
