import { useEffect, useRef, useState, useCallback } from "react";
import { X, Zap, ZapOff } from "lucide-react";
import { cn } from "@/lib/utils";

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

const FORMATS = [
  "ean_13", "ean_8", "code_128", "code_39", "code_93",
  "qr_code", "upc_a", "upc_e", "itf", "data_matrix",
  "aztec", "pdf417", "codabar",
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
  const detectorRef = useRef<InstanceType<NonNullable<typeof window.BarcodeDetector>> | null>(null);

  const stopStream = useCallback(() => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

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
          const supportedFormats = await window.BarcodeDetector.getSupportedFormats?.() ?? FORMATS;
          const formats = FORMATS.filter(f => supportedFormats.includes(f));
          detectorRef.current = new window.BarcodeDetector({
            formats: formats.length > 0 ? formats : FORMATS,
          });
        }

        setScanning(true);
      } catch {
        if (mounted) setError("Kunde inte komma åt kameran. Kontrollera kamerabehörigheter.");
      }
    };

    start();
    return () => { mounted = false; stopStream(); };
  }, [stopStream]);

  useEffect(() => {
    if (!scanning || !detectorRef.current) return;

    const scan = async () => {
      if (!videoRef.current || videoRef.current.readyState < 2) {
        animRef.current = requestAnimationFrame(scan);
        return;
      }
      try {
        const results = await detectorRef.current!.detect(videoRef.current);
        if (results.length > 0) {
          const code = results[0].rawValue;
          if (code && code !== lastScannedRef.current) {
            lastScannedRef.current = code;
            stopStream();
            onScan(code);
            onClose();
            return;
          }
        }
      } catch {}
      animRef.current = requestAnimationFrame(scan);
    };

    animRef.current = requestAnimationFrame(scan);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [scanning, onScan, onClose, stopStream]);

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
      {/* Video feed */}
      <video
        ref={videoRef}
        muted
        playsInline
        className="absolute inset-0 h-full w-full object-cover"
      />

      {/* Overlay: four quadrant corners + cutout */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Semi-transparent layer over entire screen */}
        <div className="absolute inset-0 bg-black/55" />

        {/* Cutout: a centered rounded rectangle that is "cut out" via clip-path */}
        <div
          className="absolute"
          style={{
            top: "22%",
            left: "8%",
            right: "8%",
            height: "42%",
            borderRadius: "20px",
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
            border: "2px solid rgba(255,255,255,0.15)",
            backdropFilter: "none",
          }}
        />

        {/* Corner accents */}
        {[
          "top-0 left-0 border-t-[3px] border-l-[3px] rounded-tl-[18px]",
          "top-0 right-0 border-t-[3px] border-r-[3px] rounded-tr-[18px]",
          "bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-[18px]",
          "bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br-[18px]",
        ].map((cls, i) => (
          <div
            key={i}
            className={`absolute border-white w-8 h-8 ${cls}`}
            style={{
              top: i < 2 ? "22%" : undefined,
              bottom: i >= 2 ? "36%" : undefined,
              left: i % 2 === 0 ? "8%" : undefined,
              right: i % 2 === 1 ? "8%" : undefined,
              marginTop: i < 2 ? "0" : undefined,
            }}
          />
        ))}

        {/* Animated scan line */}
        <div
          className="absolute left-[8%] right-[8%] h-0.5 bg-gradient-to-r from-transparent via-green-400 to-transparent opacity-90"
          style={{
            top: "22%",
            animation: "scanline 2s ease-in-out infinite",
          }}
        />
        <style>{`
          @keyframes scanline {
            0%   { transform: translateY(0); }
            50%  { transform: translateY(calc(42vw * 0.42)); }
            100% { transform: translateY(0); }
          }
        `}</style>
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
          <p className="text-sm text-white/50">
            EAN · QR · Data Matrix · Code 128 · och fler
          </p>
        )}
      </div>
    </div>
  );
}
