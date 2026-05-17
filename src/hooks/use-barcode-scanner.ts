import { useEffect, useRef } from "react";

// Zebra DataWedge sends barcode data as rapid keypress events followed by Enter.
// We collect characters with timestamps; if the full sequence arrives in < 100ms
// we treat it as a hardware scan rather than manual keyboard input.
//
// The hook fires `onScan(code)` globally — no input field needs focus.

const SCAN_MAX_GAP_MS = 80;  // max ms between chars in a scan burst
const SCAN_MIN_CHARS = 4;    // shortest valid barcode (EAN-8 = 8 digits, but allow GS1 shorter)

type Options = {
  onScan: (code: string) => void;
  // Set to true to also accept non-digit chars (e.g. QR codes with letters)
  acceptAlpha?: boolean;
};

export function useBarcodeScanner({ onScan, acceptAlpha = false }: Options) {
  const bufRef = useRef<string>("");
  const lastKeyTime = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const flush = () => {
      const code = bufRef.current.trim();
      bufRef.current = "";
      if (code.length >= SCAN_MIN_CHARS) onScan(code);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is actively typing in an input/textarea/contenteditable
      const target = e.target as HTMLElement;
      const isEditable =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      const now = Date.now();
      const gap = now - lastKeyTime.current;
      lastKeyTime.current = now;

      // Enter terminates a scan
      if (e.key === "Enter") {
        if (timerRef.current) clearTimeout(timerRef.current);
        const code = bufRef.current.trim();
        bufRef.current = "";
        if (code.length >= SCAN_MIN_CHARS && gap < SCAN_MAX_GAP_MS * 3) {
          onScan(code);
          // Prevent the Enter from submitting a focused form while we handle it
          if (!isEditable) e.preventDefault();
        }
        return;
      }

      // Only single printable characters
      if (e.key.length !== 1) return;
      const char = e.key;
      if (!acceptAlpha && !/[\d\-]/.test(char)) {
        // Non-numeric char during scan burst — treat as end of buffer if we had a scan going
        if (bufRef.current.length > 0 && gap < SCAN_MAX_GAP_MS) {
          if (char !== " ") bufRef.current += char;
        } else {
          bufRef.current = "";
        }
        return;
      }

      // If gap is too large, this is a new manual keystroke, not a scan continuation
      if (bufRef.current.length > 0 && gap > SCAN_MAX_GAP_MS) {
        bufRef.current = "";
      }

      // Don't intercept manual typing in editable fields when gap is large (manual input)
      if (isEditable && bufRef.current.length === 0 && gap > SCAN_MAX_GAP_MS) return;

      bufRef.current += char;

      // Reset the "abandon" timer — if nothing comes for 150ms, flush
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const code = bufRef.current.trim();
        bufRef.current = "";
        if (code.length >= SCAN_MIN_CHARS) onScan(code);
      }, 150);
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [onScan, acceptAlpha]);
}
