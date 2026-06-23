import { useEffect, useRef } from "react";

// Zebra DataWedge (TC52 and similar) sends barcode data as rapid keypress
// events followed by Enter. We collect characters with timestamps; if the
// full sequence arrives within the hardware burst window we treat it as a
// hardware scan rather than manual keyboard input.
//
// TC52 passerkort (ID/access cards) are typically alphanumeric and DataWedge
// may emit them slightly slower than EAN barcodes (~10–30 ms/char), so we
// use a relaxed gap limit and accept alpha by default when `acceptAlpha` is set.
//
// The hook fires `onScan(code)` globally — no input field needs focus.

const SCAN_MAX_GAP_MS = 120;  // TC52: up to ~120ms between chars is still hardware
const SCAN_MIN_CHARS = 4;     // shortest valid barcode
const FLUSH_TIMEOUT_MS = 200; // flush buffer if nothing arrives within 200ms

type Options = {
  onScan: (code: string) => void;
  // Set to true to also accept non-digit chars (e.g. ID cards, QR codes with letters)
  acceptAlpha?: boolean;
};

export function useBarcodeScanner({ onScan, acceptAlpha = false }: Options) {
  const bufRef = useRef<string>("");
  const lastKeyTime = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep callbacks in refs so the event listener never needs to be re-registered
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const acceptAlphaRef = useRef(acceptAlpha);
  acceptAlphaRef.current = acceptAlpha;

  useEffect(() => {
    const flush = () => {
      const code = bufRef.current.trim();
      bufRef.current = "";
      if (code.length >= SCAN_MIN_CHARS) onScanRef.current(code);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isEditable =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      const now = Date.now();
      const gap = now - lastKeyTime.current;
      lastKeyTime.current = now;

      // Enter terminates a scan burst
      if (e.key === "Enter") {
        if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
        const code = bufRef.current.trim();
        bufRef.current = "";
        // Accept if we had a burst (gap since last char is still within scan window)
        if (code.length >= SCAN_MIN_CHARS && gap < SCAN_MAX_GAP_MS * 3) {
          onScanRef.current(code);
          // Prevent Enter from submitting a focused form while we handled it
          if (!isEditable) e.preventDefault();
        }
        return;
      }

      // Only printable single characters
      if (e.key.length !== 1) return;
      const char = e.key;

      // If not accepting alpha, only digits, hyphens and alphanumeric chars during a burst
      if (!acceptAlphaRef.current && !/[\d\-]/.test(char)) {
        if (bufRef.current.length > 0 && gap < SCAN_MAX_GAP_MS) {
          // Mid-burst non-numeric (some barcodes include letters even in digit mode)
          if (char !== " ") bufRef.current += char;
        } else {
          bufRef.current = "";
        }
        return;
      }

      // Gap too large — this is a new manual keystroke, reset buffer
      if (bufRef.current.length > 0 && gap > SCAN_MAX_GAP_MS) {
        bufRef.current = "";
        if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      }

      // Don't intercept manual typing in focused input fields (gap is large = human typing)
      if (isEditable && bufRef.current.length === 0 && gap > SCAN_MAX_GAP_MS) return;

      bufRef.current += char;

      // Reset the flush timer — if nothing arrives for FLUSH_TIMEOUT_MS, fire
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, FLUSH_TIMEOUT_MS);
    };

    // TC52 / Zebra DataWedge also fires a `textInput` event containing the
    // entire barcode as a single string (like a paste). Handle this separately
    // so scanners that skip individual keydown events still work.
    const onTextInput = (e: Event) => {
      const data = (e as InputEvent).data ?? "";
      if (data.length >= SCAN_MIN_CHARS) {
        e.preventDefault();
        if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
        bufRef.current = "";
        onScanRef.current(data.trim());
      }
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("textInput", onTextInput, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      window.removeEventListener("textInput", onTextInput, { capture: true });
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []); // Empty deps — listener registered once, uses refs for live values
}
