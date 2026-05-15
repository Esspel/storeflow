import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

interface Props {
  images: string[];
  initialIndex?: number;
  onClose: () => void;
}

/**
 * Full-screen photo viewer using a native <dialog> element.
 *
 * Native dialog lives in the browser's top-layer — above ALL other elements
 * including Radix modals, regardless of z-index. Close button, backdrop tap,
 * Escape key, and touch swipe all work reliably.
 */
export function PhotoViewer({ images, initialIndex = 0, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [idx, setIdx] = useState(Math.max(0, Math.min(initialIndex, images.length - 1)));
  const touchStartX = useRef<number | null>(null);

  // Open the native dialog and set up cleanup
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    el.showModal();
    const handleClose = () => onClose();
    el.addEventListener("close", handleClose);
    return () => {
      el.removeEventListener("close", handleClose);
      if (el.open) el.close();
    };
  }, [onClose]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setIdx(i => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setIdx(i => Math.min(images.length - 1, i + 1));
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [images.length]);

  const prev = () => setIdx(i => Math.max(0, i - 1));
  const next = () => setIdx(i => Math.min(images.length - 1, i + 1));

  // Clicking the backdrop (the <dialog> element itself) closes
  const handleDialogClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) dialogRef.current?.close();
  };

  // Touch swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 40) return;
    if (dx < 0) next();
    else prev();
  };

  return (
    <dialog
      ref={dialogRef}
      onClick={handleDialogClick}
      style={{
        background: "transparent",
        border: "none",
        padding: 0,
        margin: "auto",
        maxWidth: "100vw",
        maxHeight: "100vh",
        width: "100vw",
        height: "100dvh",
        overflow: "hidden",
      }}
      className="photo-viewer-dialog"
    >
      {/* Backdrop — also handles touch swipe */}
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.92)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Close button — top right */}
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          aria-label="Stäng"
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            zIndex: 10,
            width: 44,
            height: 44,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.15)",
            border: "1.5px solid rgba(255,255,255,0.25)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            backdropFilter: "blur(4px)",
            transition: "background 0.15s",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.28)")}
          onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.15)")}
        >
          <X style={{ width: 20, height: 20 }} />
        </button>

        {/* Counter */}
        {images.length > 1 && (
          <div
            style={{
              position: "absolute",
              top: 20,
              left: "50%",
              transform: "translateX(-50%)",
              color: "rgba(255,255,255,0.7)",
              fontSize: 13,
              fontWeight: 500,
              userSelect: "none",
            }}
          >
            {idx + 1} / {images.length}
          </div>
        )}

        {/* Image */}
        <img
          src={images[idx]}
          alt=""
          onClick={e => e.stopPropagation()}
          style={{
            maxHeight: "85dvh",
            maxWidth: "calc(100vw - 96px)",
            objectFit: "contain",
            borderRadius: 8,
            boxShadow: "0 32px 64px rgba(0,0,0,0.6)",
            userSelect: "none",
            display: "block",
          }}
          draggable={false}
        />

        {/* Prev / Next buttons */}
        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={e => { e.stopPropagation(); prev(); }}
              disabled={idx === 0}
              aria-label="Föregående"
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: idx === 0 ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.15)",
                border: "1.5px solid rgba(255,255,255,0.2)",
                cursor: idx === 0 ? "default" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: idx === 0 ? "rgba(255,255,255,0.3)" : "white",
              }}
            >
              <ChevronLeft style={{ width: 20, height: 20 }} />
            </button>
            <button
              type="button"
              onClick={e => { e.stopPropagation(); next(); }}
              disabled={idx === images.length - 1}
              aria-label="Nästa"
              style={{
                position: "absolute",
                right: 12,
                top: "50%",
                transform: "translateY(-50%)",
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: idx === images.length - 1 ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.15)",
                border: "1.5px solid rgba(255,255,255,0.2)",
                cursor: idx === images.length - 1 ? "default" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: idx === images.length - 1 ? "rgba(255,255,255,0.3)" : "white",
              }}
            >
              <ChevronRight style={{ width: 20, height: 20 }} />
            </button>
          </>
        )}

        {/* Swipe hint on mobile */}
        {images.length > 1 && (
          <div
            style={{
              position: "absolute",
              bottom: 20,
              display: "flex",
              gap: 6,
            }}
          >
            {images.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={e => { e.stopPropagation(); setIdx(i); }}
                style={{
                  width: i === idx ? 20 : 8,
                  height: 8,
                  borderRadius: 4,
                  background: i === idx ? "white" : "rgba(255,255,255,0.35)",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  transition: "width 0.2s, background 0.2s",
                }}
                aria-label={`Bild ${i + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </dialog>
  );
}
