import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

interface Props {
  images: string[];
  initialIndex?: number;
  onClose: () => void;
}

/**
 * Full-screen image gallery rendered directly into document.body via portal.
 *
 * Intentionally avoids native <dialog> and Radix primitives. Uses a plain
 * fixed-position div with the highest possible z-index (2147483647), rendered
 * via createPortal outside any existing React tree so no parent context or
 * event-capture can interfere with close behaviour.
 *
 * Close paths: X button, backdrop click, Escape key, swipe down (mobile).
 */
export function PhotoViewer({ images, initialIndex = 0, onClose }: Props) {
  const [idx, setIdx] = useState(Math.max(0, Math.min(initialIndex, images.length - 1)));
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const closedRef = useRef(false);

  const close = () => {
    if (closedRef.current) return;
    closedRef.current = true;
    onClose();
  };

  // Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); close(); }
      if (e.key === "ArrowLeft") setIdx(i => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setIdx(i => Math.min(images.length - 1, i + 1));
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images.length]);

  // Prevent body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const prev = () => setIdx(i => Math.max(0, i - 1));
  const next = () => setIdx(i => Math.min(images.length - 1, i + 1));

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    touchStart.current = null;
    // Swipe down to close
    if (dy > 80 && Math.abs(dx) < Math.abs(dy)) { close(); return; }
    // Swipe left/right to navigate
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) next(); else prev();
    }
  };

  const content = (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483647,
        background: "rgba(0,0,0,0.95)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        touchAction: "none",
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      // Backdrop click: close when clicking the backdrop itself (not image/buttons).
      // Also stop native propagation so Radix dismiss-layer does not see this
      // pointer-down and close the underlying Dialog.
      onPointerDown={(e) => {
        e.nativeEvent.stopImmediatePropagation();
        if (e.target === e.currentTarget) close();
      }}
    >
      {/* Close button — large touch target */}
      <button
        type="button"
        onPointerDown={e => e.nativeEvent.stopImmediatePropagation()}
        onClick={close}
        aria-label="Stäng"
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          width: 48,
          height: 48,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.18)",
          border: "1.5px solid rgba(255,255,255,0.3)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          zIndex: 10,
          WebkitTapHighlightColor: "transparent",
        }}
      >
        <X style={{ width: 22, height: 22, pointerEvents: "none" }} />
      </button>

      {/* Image counter */}
      {images.length > 1 && (
        <div style={{
          position: "absolute", top: 20, left: "50%", transform: "translateX(-50%)",
          color: "rgba(255,255,255,0.65)", fontSize: 13, fontWeight: 500, userSelect: "none",
          pointerEvents: "none",
        }}>
          {idx + 1} / {images.length}
        </div>
      )}

      {/* Image */}
      <img
        key={images[idx]}
        src={images[idx]}
        alt=""
        draggable={false}
        onMouseDown={e => e.stopPropagation()}
        style={{
          maxHeight: "80dvh",
          maxWidth: "min(calc(100vw - 88px), 1200px)",
          objectFit: "contain",
          borderRadius: 10,
          boxShadow: "0 24px 64px rgba(0,0,0,0.7)",
          userSelect: "none",
          display: "block",
          pointerEvents: "none",
        }}
      />

      {/* Swipe hint */}
      {images.length > 1 && (
        <div style={{
          position: "absolute", bottom: 24,
          display: "flex", gap: 6, alignItems: "center",
          pointerEvents: "none",
        }}>
          {images.map((_, i) => (
            <span key={i} style={{
              width: i === idx ? 20 : 7,
              height: 7,
              borderRadius: 4,
              background: i === idx ? "white" : "rgba(255,255,255,0.35)",
              display: "inline-block",
              transition: "width 0.2s, background 0.2s",
            }} />
          ))}
        </div>
      )}

      {/* Prev / Next — hidden on single image */}
      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={e => { e.stopPropagation(); prev(); }}
            disabled={idx === 0}
            aria-label="Föregående"
            style={{
              position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)",
              width: 44, height: 44, borderRadius: "50%",
              background: idx === 0 ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.18)",
              border: "1.5px solid rgba(255,255,255,0.2)",
              cursor: idx === 0 ? "default" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: idx === 0 ? "rgba(255,255,255,0.25)" : "white",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <ChevronLeft style={{ width: 20, height: 20, pointerEvents: "none" }} />
          </button>
          <button
            type="button"
            onClick={e => { e.stopPropagation(); next(); }}
            disabled={idx === images.length - 1}
            aria-label="Nästa"
            style={{
              position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
              width: 44, height: 44, borderRadius: "50%",
              background: idx === images.length - 1 ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.18)",
              border: "1.5px solid rgba(255,255,255,0.2)",
              cursor: idx === images.length - 1 ? "default" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: idx === images.length - 1 ? "rgba(255,255,255,0.25)" : "white",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <ChevronRight style={{ width: 20, height: 20, pointerEvents: "none" }} />
          </button>
        </>
      )}
    </div>
  );

  return createPortal(content, document.body);
}
