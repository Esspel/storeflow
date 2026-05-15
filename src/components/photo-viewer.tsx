import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

interface Props {
  images: string[];
  initialIndex?: number;
  onClose: () => void;
}

export function PhotoViewer({ images, initialIndex = 0, onClose }: Props) {
  const [idx, setIdx] = useState(Math.max(0, Math.min(initialIndex, images.length - 1)));
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  // Lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Keyboard navigation + Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
      else if (e.key === "ArrowLeft") setIdx(i => Math.max(0, i - 1));
      else if (e.key === "ArrowRight") setIdx(i => Math.min(images.length - 1, i + 1));
    };
    // Use capture so we intercept before Radix can process Escape
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [images.length, onClose]);

  const prev = () => setIdx(i => Math.max(0, i - 1));
  const next = () => setIdx(i => Math.min(images.length - 1, i + 1));

  // Touch swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    touchStart.current = null;
    if (dy > 80 && Math.abs(dx) < Math.abs(dy)) { onClose(); return; }
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) next(); else prev();
    }
  };

  const content = (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        background: "rgba(0,0,0,0.93)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Invisible backdrop — clicking here closes. Must be below the image/buttons */}
      <div
        onClick={onClose}
        style={{ position: "absolute", inset: 0 }}
        aria-label="Stäng"
      />

      {/* Close button — above the backdrop div */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Stäng"
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          zIndex: 2,
          width: 52,
          height: 52,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.15)",
          border: "2px solid rgba(255,255,255,0.35)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
        }}
      >
        <X style={{ width: 24, height: 24 }} />
      </button>

      {/* Counter */}
      {images.length > 1 && (
        <div style={{
          position: "absolute", top: 18, left: "50%", transform: "translateX(-50%)",
          zIndex: 2, color: "rgba(255,255,255,0.7)", fontSize: 14, fontWeight: 500,
          pointerEvents: "none", userSelect: "none",
        }}>
          {idx + 1} / {images.length}
        </div>
      )}

      {/* Image — above backdrop, stops click from reaching backdrop */}
      <img
        key={idx}
        src={images[idx]}
        alt=""
        draggable={false}
        onClick={e => e.stopPropagation()}
        style={{
          position: "relative",
          zIndex: 1,
          maxHeight: "85dvh",
          maxWidth: "calc(100vw - 96px)",
          objectFit: "contain",
          borderRadius: 8,
          boxShadow: "0 20px 60px rgba(0,0,0,0.8)",
          userSelect: "none",
          display: "block",
        }}
      />

      {/* Prev / Next */}
      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={e => { e.stopPropagation(); prev(); }}
            disabled={idx === 0}
            aria-label="Föregående"
            style={{
              position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)",
              zIndex: 2, width: 48, height: 48, borderRadius: "50%",
              background: "rgba(255,255,255,0.15)",
              border: "1.5px solid rgba(255,255,255,0.25)",
              cursor: idx === 0 ? "default" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: idx === 0 ? "rgba(255,255,255,0.2)" : "white",
              opacity: idx === 0 ? 0.4 : 1,
            }}
          >
            <ChevronLeft style={{ width: 22, height: 22 }} />
          </button>
          <button
            type="button"
            onClick={e => { e.stopPropagation(); next(); }}
            disabled={idx === images.length - 1}
            aria-label="Nästa"
            style={{
              position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
              zIndex: 2, width: 48, height: 48, borderRadius: "50%",
              background: "rgba(255,255,255,0.15)",
              border: "1.5px solid rgba(255,255,255,0.25)",
              cursor: idx === images.length - 1 ? "default" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: idx === images.length - 1 ? "rgba(255,255,255,0.2)" : "white",
              opacity: idx === images.length - 1 ? 0.4 : 1,
            }}
          >
            <ChevronRight style={{ width: 22, height: 22 }} />
          </button>
        </>
      )}

      {/* Dot indicators */}
      {images.length > 1 && (
        <div style={{
          position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)",
          zIndex: 2, display: "flex", gap: 6, pointerEvents: "none",
        }}>
          {images.map((_, i) => (
            <span key={i} style={{
              width: i === idx ? 20 : 7, height: 7, borderRadius: 4,
              background: i === idx ? "white" : "rgba(255,255,255,0.4)",
              display: "inline-block", transition: "width 0.2s",
            }} />
          ))}
        </div>
      )}
    </div>
  );

  return createPortal(content, document.body);
}
