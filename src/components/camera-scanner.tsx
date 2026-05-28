import { useEffect, useRef, useState, useCallback } from "react";
import { X, Zap, ZapOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  onScan: (code: string) => void;
  onClose: () => void;
}

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats: string[] }) => {
      detect(source: ImageBitmapSource): Promise<{ rawValue: string; format: string }[]>;
    };
  }
}

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

        // Check torch support
        const track = stream.getVideoTracks()[0];
        const caps = track.getCapabilities?.() as { torch?: boolean } | undefined;
        if (caps?.torch) setTorchSupported(true);

        // Set up BarcodeDetector
        if (window.BarcodeDetector) {
          detectorRef.current = new window.BarcodeDetector({
            formats: ["ean_13", "ean_8", "code_128", "code_39", "qr_code", "upc_a", "upc_e", "itf", "data_matrix"],
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

  // Scan loop using BarcodeDetector
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
    <div className="fixed inset-0 z-[300] flex flex-col bg-black">
      {/* Video feed */}
      <video
        ref={videoRef}
        muted
        playsInline
        className="absolute inset-0 h-full w-full object-cover"
      />

      {/* Dark overlay with cutout */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Top */}
        <div className="absolute inset-x-0 top-0 h-[20%] bg-black/70" />
        {/* Bottom */}
        <div className="absolute inset-x-0 bottom-0 h-[35%] bg-black/70" />
        {/* Left */}
        <div className="absolute left-0 top-[20%] w-[8%] h-[45%] bg-black/70" />
        {/* Right */}
        <div className="absolute right-0 top-[20%] w-[8%] h-[45%] bg-black/70" />

        {/* Corner markers */}
        <svg
          className="absolute"
          style={{ left: "8%", top: "20%", width: "84%", height: "45%" }}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {/* Top-left */}
          <path d="M 3,15 L 3,3 L 15,3" stroke="white" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          {/* Top-right */}
          <path d="M 85,3 L 97,3 L 97,15" stroke="white" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          {/* Bottom-left */}
          <path d="M 3,85 L 3,97 L 15,97" stroke="white" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          {/* Bottom-right */}
          <path d="M 85,97 L 97,97 L 97,85" stroke="white" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          {/* Scan line */}
          <line x1="5" y1="50" x2="95" y2="50" stroke="#22c55e" strokeWidth="1" opacity="0.8" strokeDasharray="4,3">
            <animate attributeName="y1" values="15;85;15" dur="2.5s" repeatCount="indefinite" />
            <animate attributeName="y2" values="15;85;15" dur="2.5s" repeatCount="indefinite" />
          </line>
        </svg>
      </div>

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-5 pt-12 pb-4">
        <button
          onClick={() => { stopStream(); onClose(); }}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm"
        >
          <X className="h-5 w-5" />
        </button>
        <span className="text-sm font-medium text-white/90">Scanna streckkod</span>
        {torchSupported ? (
          <button
            onClick={toggleTorch}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full backdrop-blur-sm",
              torchOn ? "bg-yellow-400/90 text-black" : "bg-black/40 text-white"
            )}
          >
            {torchOn ? <Zap className="h-5 w-5" /> : <ZapOff className="h-5 w-5" />}
          </button>
        ) : (
          <div className="h-10 w-10" />
        )}
      </div>

      {/* Bottom hint */}
      <div className="relative z-10 mt-auto px-6 pb-16 text-center">
        {error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : (
          <p className="text-sm text-white/60">Rikta kameran mot streckkoden</p>
        )}
      </div>
    </div>
  );
}
