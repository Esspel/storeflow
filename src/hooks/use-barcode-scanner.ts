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

// Hardware burst window constants (inlined below with comments)
// TC52: up to ~150ms between chars is still hardware
// Shortest valid barcode: 4 chars
// Flush buffer if nothing arrives within 300ms

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
      if (code.length >= 4) onScanRef.current(code); // SCAN_MIN_CHARS = 4
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isEditable =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      // Never intercept clipboard shortcuts or modifier combos in editable fields
      if (isEditable && (e.ctrlKey || e.metaKey)) return;

      const now = Date.now();
      const gap = now - lastKeyTime.current;
      lastKeyTime.current = now;

      // Enter terminates a scan burst
      if (e.key === "Enter") {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        const code = bufRef.current.trim();
        bufRef.current = "";
        // Accept if we had a burst (gap since last char is still within scan window)
        if (code.length >= 4 && gap < 600) {
          // 150ms * 4 = 600ms max burst duration
          onScanRef.current(code);
          // Prevent Enter from submitting a focused form while we handled it
          if (!isEditable) e.preventDefault();
        }
        return;
      }

      // Tab can also terminate some DataWedge configurations
      if (e.key === "Tab" && bufRef.current.length >= 4) {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        const code = bufRef.current.trim();
        bufRef.current = "";
        if (code.length >= 4) {
          onScanRef.current(code);
          e.preventDefault();
        }
        return;
      }

      // Only printable single characters
      if (e.key.length !== 1) return;
      const char = e.key;

      // If not accepting alpha, only digits, hyphens and alphanumeric chars during a burst
      if (!acceptAlphaRef.current && !/[\d\-]/.test(char)) {
        if (bufRef.current.length > 0 && gap < 150) {
          // Mid-burst non-numeric (some barcodes include letters even in digit mode)
          if (char !== " ") bufRef.current += char;
        } else {
          bufRef.current = "";
        }
        return;
      }

      // Gap too large — this is a new manual keystroke, reset buffer
      if (bufRef.current.length > 0 && gap > 150) {
        bufRef.current = "";
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      }

      // Don't intercept manual typing in focused input fields (gap is large = human typing)
      if (isEditable && bufRef.current.length === 0 && gap > 150) return;

      bufRef.current += char;

      // Reset the flush timer — if nothing arrives for 300ms, fire
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, 300);
    };

    // TC52 / Zebra DataWedge also fires a `textInput` event containing the
    // entire barcode as a single string (like a paste). Handle this separately
    // so scanners using that mode also work without the keypress path.
    const onTextInput = (e: Event) => {
      const inputEvent = e as InputEvent;
      if (inputEvent.data && inputEvent.data.length >= 4) {
        onScanRef.current(inputEvent.data.trim());
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("textInput", onTextInput as EventListener, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("textInput", onTextInput as EventListener, true);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);
}