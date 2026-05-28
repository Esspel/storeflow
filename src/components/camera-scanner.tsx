import { useEffect, useRef, useState, useCallback } from "react";
import { X, Zap, ZapOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { BrowserMultiFormatOneDReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";

interface Props {
  onScan: (code: string) => void;
  onClose: () => void;
}

declare global {
  interface Window {
    BarcodeDetector?: {
      new (options?: { formats: string[] }): {
        detect(source: ImageBitmapSource): Promise<{ rawValue: string; format: string }[]>;
      };
      getSupportedFormats?(): Promise<string[]>;
    };
  }
}

const NATIVE_FORMATS = [
  "ean_13", "ean_8", "code_128", "code_39", "code_93",
  "qr_code", "upc_a", "upc_e", "itf", "data_matrix", "aztec", "pdf417", "codabar",
];

const ZXING_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.CODE_93,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.ITF,
  BarcodeFormat.CODABAR,
  BarcodeFormat.QR_CODE,
  BarcodeFormat.DATA_MATRIX,
];

export function CameraScanner({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animRef = useRef<number | null>(null);
  const lastScannedRef = useRef<string>("");
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [useNative, setUseNative] = useState(false);
  const detectorRef = useRef<InstanceType<NonNullable<typeof window.BarcodeDetector>> | null>(null);

  const stopStream = useCallback(() => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  const handleScan = useCallback((code: string) => {
    if (!code || code === lastScannedRef.current) return;
    lastScannedRef.current = code;
    stopStream();
    onScan(code);
    onClose();
  }, [onScan, onClose, stopStream]);

  useEffect(() => {
    let mounted = true;

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (!mounted) { stream.getTracks().forEach(t => t.stop()); return; }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const track = stream.getVideoTracks()[0];
        const caps = track.getCapabilities?.() as { torch?: boolean } | undefined;
        if (caps?.torch) setTorchSupported(true);

        if (window.BarcodeDetector) {
          try {
            const supportedFormats = await window.BarcodeDetector.getSupportedFormats?.() ?? NATIVE_FORMATS;
            const formats = NATIVE_FORMATS.filter(f => supportedFormats.includes(f));
            detectorRef.current = new window.BarcodeDetector({
              formats: formats.length > 0 ? formats : NATIVE_FORMATS,
            });
            setUseNative(true);
          } catch {
            // Fall through to ZXing
          }
        }

        setScanning(true);
      } catch {
        if (mounted) setError("Kunde inte komma åt kameran. Kontrollera kamerabehörigheter.");
      }
    };

    start();
    return () => { mounted = false; stopStream(); };
  }, [stopStream]);

  // Native BarcodeDetector loop (Chrome / Android / desktop)
  useEffect(() => {
    if (!scanning || !useNative || !detectorRef.current) return;

    const scan = async () => {
      if (!videoRef.current || videoRef.current.readyState < 2) {
        animRef.current = requestAnimationFrame(scan);
        return;
      }
      try {
        const results = await detectorRef.current!.detect(videoRef.current);
        if (results.length > 0) { handleScan(results[0].rawValue); return; }
      } catch {}
      animRef.current = requestAnimationFrame(scan);
    };

    animRef.current = requestAnimationFrame(scan);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [scanning, useNative, handleScan]);

  // ZXing loop — EAN-13/8, Code-128/39, UPC etc. Works on iOS Safari
  useEffect(() => {
    if (!scanning || useNative) return;

    const video = videoRef.current;
    if (!video) return;

    const hints = new Map<DecodeHintType, unknown>();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, ZXING_FORMATS);
    hints.set(DecodeHintType.TRY_HARDER, true);

    const reader = new BrowserMultiFormatOneDReader(hints);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    let stopped = false;

    const scan = () => {
      if (stopped) return;
      if (!video || video.readyState < 2 || video.videoWidth === 0) {
        animRef.current = requestAnimationFrame(scan);
        return;
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);

      try {
        const result = reader.decodeFromCanvas(canvas);
        if (result?.getText()) {
          handleScan(result.getText());
          return;
        }
      } catch {
        // NotFoundException thrown when no barcode found — expected, keep scanning
      }

      animRef.current = requestAnimationFrame(scan);
    };

    animRef.current = requestAnimationFrame(scan);
    return () => {
      stopped = true;
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [scanning, useNative, handleScan]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await (track as MediaStreamTrack & { applyConstraints(c: object): Promise<void> })
        .applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {}
  };

  return (
    <div className="fixed inset-0 z-[300] bg-black flex flex-col">
      <video
        ref={videoRef}
        muted
        playsInline
        className="absolute inset-0 h-full w-full object-cover"
      />

      {/* Overlay with cutout */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-black/55" />
        <div
          className="absolute"
          style={{
            top: "22%", left: "8%", right: "8%", height: "42%",
            borderRadius: "20px",
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
            border: "2px solid rgba(255,255,255,0.25)",
          }}
        />
        {/* Corner accents */}
        {[
          { top: "22%", left: "8%", borderTop: "3px solid white", borderLeft: "3px solid white", borderRadius: "18px 0 0 0" },
          { top: "22%", right: "8%", borderTop: "3px solid white", borderRight: "3px solid white", borderRadius: "0 18px 0 0" },
          { bottom: "36%", left: "8%", borderBottom: "3px solid white", borderLeft: "3px solid white", borderRadius: "0 0 0 18px" },
          { bottom: "36%", right: "8%", borderBottom: "3px solid white", borderRight: "3px solid white", borderRadius: "0 0 18px 0" },
        ].map((style, i) => (
          <div key={i} className="absolute w-8 h-8" style={style} />
        ))}
      </div>

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-5 pt-safe pt-12 pb-4">
        <button
          onClick={() => { stopStream(); onClose(); }}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 backdrop-blur-md text-white active:scale-95 transition-transform"
        >
          <X className="h-5 w-5" />
        </button>
        <span className="text-sm font-semibold text-white drop-shadow">Scanna streckkod</span>
        {torchSupported ? (
          <button
            onClick={toggleTorch}
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-full backdrop-blur-md active:scale-95 transition-all",
              torchOn ? "bg-yellow-400 text-black" : "bg-white/10 text-white"
            )}
          >
            {torchOn ? <Zap className="h-5 w-5" /> : <ZapOff className="h-5 w-5" />}
          </button>
        ) : (
          <div className="h-11 w-11" />
        )}
      </div>

      {/* Bottom hint */}
      <div className="relative z-10 mt-auto px-6 pb-safe pb-12 text-center">
        {error ? (
          <div className="rounded-2xl bg-red-500/20 backdrop-blur-md px-4 py-3 border border-red-400/30">
            <p className="text-sm text-red-200">{error}</p>
          </div>
        ) : (
          <p className="text-sm text-white/60">EAN-13 · EAN-8 · Code 128 · QR · och fler</p>
        )}
      </div>
    </div>
  );
}
