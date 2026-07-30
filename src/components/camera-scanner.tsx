import { useEffect, useRef, useState, useCallback } from "react";
import { X, Zap, ZapOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { BrowserMultiFormatOneDReader } from "@zxing/browser";

// Numeric values from @zxing/library enums (avoids CJS/ESM interop issues)
const ZXING_FORMATS = [1, 2, 3, 4, 6, 7, 8, 11, 14, 15]; // CODABAR, CODE_39, CODE_93, CODE_128, EAN_8, EAN_13, ITF, QR_CODE, UPC_A, UPC_E
const HINT_POSSIBLE_FORMATS = 2;
const HINT_TRY_HARDER = 3;

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

export function CameraScanner({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animRef = useRef<number | null>(null);
  const lastScannedRef = useRef<string>("");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [useNative, setUseNative] = useState(false);
  const detectorRef = useRef<InstanceType<NonNullable<typeof window.BarcodeDetector>> | null>(null);

  const stopStream = useCallback(() => {
    if (animRef.current) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const handleScan = useCallback(
    (code: string) => {
      if (!code || code === lastScannedRef.current) return;
      lastScannedRef.current = code;
      stopStream();
      onScan(code);
      onClose();
    },
    [onScan, onClose, stopStream]
  );

  // Initiera kamera och detektor
  useEffect(() => {
    let mounted = true;

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });

        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }

        const track = stream.getVideoTracks()[0];
        const caps = track?.getCapabilities?.() as { torch?: boolean } | undefined;
        if (caps?.torch) setTorchSupported(true);

        // Kontrollera stöd för Native BarcodeDetector
        if (window.BarcodeDetector) {
          try {
            const supportedFormats = (await window.BarcodeDetector.getSupportedFormats?.()) ?? NATIVE_FORMATS;
            const formats = NATIVE_FORMATS.filter((f) => supportedFormats.includes(f));
            detectorRef.current = new window.BarcodeDetector({
              formats: formats.length > 0 ? formats : NATIVE_FORMATS,
            });
            setUseNative(true);
          } catch {
            // Fallback till ZXing
          }
        }

        if (mounted) setScanning(true);
      } catch (err) {
        if (mounted) {
          setError("Kunde inte komma åt kameran. Kontrollera kamerabehörigheter.");
        }
      }
    };

    start();

    return () => {
      mounted = false;
      stopStream();
    };
  }, [stopStream]);

  // Native BarcodeDetector-loop (Chrome / Android / moderna webbläsare)
  useEffect(() => {
    if (!scanning || !useNative || !detectorRef.current) return;

    let isScanningFrame = false;

    const scan = async () => {
      if (!videoRef.current || videoRef.current.readyState < 2) {
        animRef.current = requestAnimationFrame(scan);
        return;
      }

      if (!isScanningFrame) {
        isScanningFrame = true;
        try {
          const results = await detectorRef.current!.detect(videoRef.current);
          if (results.length > 0) {
            handleScan(results[0].rawValue);
            return;
          }
        } catch {
          // Ignorera detekteringsfel och fortsätt söka
        } finally {
          isScanningFrame = false;
        }
      }

      animRef.current = requestAnimationFrame(scan);
    };

    animRef.current = requestAnimationFrame(scan);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [scanning, useNative, handleScan]);

  // ZXing-loop (Fallback för Safari/iOS m.fl.)
  useEffect(() => {
    if (!scanning || useNative) return;

    const video = videoRef.current;
    if (!video) return;

    const hints = new Map<number, unknown>();
    hints.set(HINT_POSSIBLE_FORMATS, ZXING_FORMATS);
    hints.set(HINT_TRY_HARDER, true);

    const reader = new BrowserMultiFormatOneDReader(hints);
    
    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
    }
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    let stopped = false;
    let lastScanTime = 0;
    const SCAN_INTERVAL_MS = 120; // Kör avkodning max var 120ms för att skona batteri/CPU

    const scan = (time: number) => {
      if (stopped) return;

      if (!video || video.readyState < 2 || video.videoWidth === 0) {
        animRef.current = requestAnimationFrame(scan);
        return;
      }

      if (time - lastScanTime >= SCAN_INTERVAL_MS) {
        lastScanTime = time;

        // Anpassa canvas efter videons mått
        if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
        if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;

        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          try {
            const result = reader.decodeFromCanvas(canvas);
            if (result?.getText()) {
              handleScan(result.getText());
              return;
            }
          } catch {
            // NotFoundException kastas när ingen kod hittas
          }
        }
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
      await (track as MediaStreamTrack & { applyConstraints(c: object): Promise<void> }).applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      });
      setTorchOn(next);
    } catch {
      // Belysning stöds ej eller nekades
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex flex-col bg-black">
      <video
        ref={videoRef}
        muted
        playsInline
        className="absolute inset-0 h-full w-full object-cover"
      />

      {/* Overlay med utskärning för siktområde */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-black/55" />
        <div
          className="absolute"
          style={{
            top: "22%",
            left: "8%",
            right: "8%",
            height: "42%",
            borderRadius: "20px",
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
            border: "2px solid rgba(255,255,255,0.25)",
          }}
        />
        {/* Hörnmarkeringar */}
        {[
          { top: "22%", left: "8%", borderTop: "3px solid white", borderLeft: "3px solid white", borderRadius: "18px 0 0 0" },
          { top: "22%", right: "8%", borderTop: "3px solid white", borderRight: "3px solid white", borderRadius: "0 18px 0 0" },
          { bottom: "36%", left: "8%", borderBottom: "3px solid white", borderLeft: "3px solid white", borderRadius: "0 0 0 18px" },
          { bottom: "36%", right: "8%", borderBottom: "3px solid white", borderRight: "3px solid white", borderRadius: "0 0 18px 0" },
        ].map((style, i) => (
          <div key={i} className="absolute h-8 w-8" style={style} />
        ))}
      </div>

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-5 pt-12 pb-4 pt-safe">
        <button
          onClick={() => {
            stopStream();
            onClose();
          }}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition-transform active:scale-95"
          aria-label="Stäng"
        >
          <X className="h-5 w-5" />
        </button>
        <span className="text-sm font-semibold text-white drop-shadow">Scanna streckkod</span>
        {torchSupported ? (
          <button
            onClick={toggleTorch}
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-full backdrop-blur-md transition-all active:scale-95",
              torchOn ? "bg-yellow-400 text-black" : "bg-white/10 text-white"
            )}
            aria-label="Tänd/släck ficklampa"
          >
            {torchOn ? <Zap className="h-5 w-5" /> : <ZapOff className="h-5 w-5" />}
          </button>
        ) : (
          <div className="h-11 w-11" />
        )}
      </div>

      {/* Undre informationstext */}
      <div className="relative z-10 mt-auto px-6 pb-12 text-center pb-safe">
        {error ? (
          <div className="rounded-2xl border border-red-400/30 bg-red-500/20 px-4 py-3 backdrop-blur-md">
            <p className="text-sm text-red-200">{error}</p>
          </div>
        ) : (
          <p className="text-sm text-white/60">EAN-13 · EAN-8 · Code 128 · QR · med flera</p>
        )}
      </div>
    </div>
  );
}
