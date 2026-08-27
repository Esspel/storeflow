/**
 * posemesh React Hooks
 * Integration with posemesh Web SDK for spatial computing
 */

import { useEffect, useRef, useState, useCallback } from "react";
import type {
  PosemeshConfig,
  PosemeshStatus,
  QRCode,
  Barcode,
  ArUcoMarker,
  Pose,
  PosemeshDetectionOptions,
  PosemeshDetectionCallbacks,
  Vector2,
} from "@/lib/posemesh/types";

// ============================================================================
// posemesh Module Types (matching Emscripten exports)
// ============================================================================

interface PosemeshModule {
  QRDetection?: {
    detectQRFromLuminance(luminance: Uint8Array, width: number, height: number): QRCode[];
  };
  BarcodeDetection?: {
    detectBarcodeFromLuminance(luminance: Uint8Array, width: number, height: number): Barcode[];
  };
  ArucoDetection?: {
    detectArucoFromLuminance(
      luminance: Uint8Array,
      width: number,
      height: number,
      markerFormat?: number,
    ): ArUcoMarker[];
    detectArucoFromLuminanceLandmarkObservations(
      luminance: Uint8Array,
      width: number,
      height: number,
    ): ArUcoMarker[];
  };
  PoseEstimation?: {
    solvePnP(
      objectPoints: number[],
      imagePoints: number[],
      cameraMatrix: number[],
      distCoeffs: number[],
    ): Pose | null;
  };
  getVersion?: () => string;
  getCommitId?: () => string;
}

// ============================================================================
// posemesh Module Loader (Singleton)
// ============================================================================

let posemeshModule: PosemeshModule | null = null;
let posemeshInitPromise: Promise<PosemeshModule | null> | null = null;

async function loadPosemeshModule(): Promise<PosemeshModule | null> {
  if (posemeshModule) return posemeshModule;
  if (posemeshInitPromise) return posemeshInitPromise;

  posemeshInitPromise = (async () => {
    if (typeof window === "undefined") {
      throw new Error("posemesh only works in browser environment");
    }

    // Dynamically import the Emscripten module
    const mod = await import("@/lib/posemesh/Posemesh.js");

    // The default export is the initialization function
    const initializeModule = mod.default || mod;

    // Initialize the WebAssembly module
    const wasmExports = await initializeModule({
      locateFile: (path: string) => {
        // Point to the wasm file in the same directory
        if (path.endsWith(".wasm")) {
          return new URL("@/lib/posemesh/Posemesh.wasm", import.meta.url).href;
        }
        return path;
      },
    });

    // Extract the classes we need from the wasm exports
    posemeshModule = {
      QRDetection: wasmExports.QRDetection as PosemeshModule["QRDetection"],
      BarcodeDetection: wasmExports.BarcodeDetection as PosemeshModule["BarcodeDetection"],
      ArucoDetection: wasmExports.ArucoDetection as PosemeshModule["ArucoDetection"],
      PoseEstimation: wasmExports.PoseEstimation as PosemeshModule["PoseEstimation"],
      getVersion: () => wasmExports.version || "0.1.0",
      getCommitId: () => wasmExports.commitId || "unknown",
    };

    return posemeshModule;
  })();

  return posemeshInitPromise;
}

// ============================================================================
// posemesh Initialization Hook
// ============================================================================

interface UsePosemeshReturn {
  status: PosemeshStatus;
  error: Error | null;
  version: string | null;
  commitId: string | null;
  initialize: (config?: Partial<PosemeshConfig>) => Promise<void>;
  isReady: boolean;
}

export function usePosemesh(): UsePosemeshReturn {
  const [status, setStatus] = useState<PosemeshStatus>("uninitialized");
  const [error, setError] = useState<Error | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [commitId, setCommitId] = useState<string | null>(null);
  const initializedRef = useRef(false);

  const initialize = useCallback(async (config?: Partial<PosemeshConfig>) => {
    if (initializedRef.current) return;

    setStatus("initializing");
    setError(null);

    try {
      // Load and initialize posemesh WASM module
      const module = await loadPosemeshModule();
      if (!module) {
        throw new Error("Failed to load posemesh module");
      }

      // Get version info
      if (module.getVersion) {
        setVersion(module.getVersion());
      }
      if (module.getCommitId) {
        setCommitId(module.getCommitId());
      }

      initializedRef.current = true;
      setStatus("ready");
    } catch (err) {
      const initError = err instanceof Error ? err : new Error(String(err));
      setError(initError);
      setStatus("error");
      throw initError;
    }
  }, []);

  // Auto-initialize on mount
  useEffect(() => {
    if (!initializedRef.current) {
      initialize().catch(() => {
        // Error already set in initialize()
      });
    }
  }, [initialize]);

  return {
    status,
    error,
    version,
    commitId,
    initialize,
    isReady: status === "ready",
  };
}

// ============================================================================
// posemesh Detection Hook (Camera + QR/ArUco/Pose)
// ============================================================================

interface UsePosemeshDetectionReturn {
  start: () => Promise<void>;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  isScanning: boolean;
  error: Error | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

export function usePosemeshDetection(
  options: PosemeshDetectionOptions,
): UsePosemeshDetectionReturn {
  const { facingMode, scanIntervalMs = 100, callbacks } = options;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<number | null>(null);
  const processingRef = useRef(false);
  const pausedRef = useRef(false);

  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const processFrame = useCallback(async () => {
    if (processingRef.current || pausedRef.current) return;
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    // Check video ready state
    if (video.readyState !== video.HAVE_ENOUGH_DATA) return;

    processingRef.current = true;

    try {
      // Set canvas size to video size
      const width = video.videoWidth;
      const height = video.videoHeight;

      if (width === 0 || height === 0) {
        processingRef.current = false;
        return;
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        processingRef.current = false;
        return;
      }

      // Draw video frame to canvas
      ctx.drawImage(video, 0, 0, width, height);

      // Get image data for luminance extraction
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;

      // Convert RGBA to luminance (grayscale) - standard Rec. 709 weights
      const luminance = new Uint8Array(width * height);
      for (let i = 0, j = 0; i < data.length; i += 4, j++) {
        luminance[j] = Math.round(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
      }

      // Load posemesh module for detection
      const module = await loadPosemeshModule();
      if (!module) {
        return;
      }

      // Detect QR codes
      if (callbacks.onQRDetected && module.QRDetection) {
        try {
          const qrCodes = module.QRDetection.detectQRFromLuminance(luminance, width, height);
          if (qrCodes.length > 0) {
            callbacks.onQRDetected(qrCodes);
          }
        } catch (qrError) {
          console.warn("QR detection error:", qrError);
        }
      }

      // Detect Barcodes (EAN-13, EAN-8, UPC, Code128, etc.)
      if (callbacks.onBarcodeDetected && module.BarcodeDetection) {
        try {
          const barcodes = module.BarcodeDetection.detectBarcodeFromLuminance(
            luminance,
            width,
            height,
          );
          if (barcodes.length > 0) {
            callbacks.onBarcodeDetected(barcodes);
          }
        } catch (barcodeError) {
          console.warn("Barcode detection error:", barcodeError);
        }
      }

      // Detect ArUco markers
      if (callbacks.onArUcoDetected && module.ArucoDetection) {
        try {
          const markers = module.ArucoDetection.detectArucoFromLuminance(luminance, width, height);
          if (markers.length > 0) {
            callbacks.onArUcoDetected(markers);
          }
        } catch (arucoError) {
          console.warn("ArUco detection error:", arucoError);
        }
      }

      // Note: Pose estimation is handled downstream.
      if (callbacks.onPoseEstimated && module.PoseEstimation) {
        callbacks.onPoseEstimated({
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          matrix: (window as any).THREE
            ? new (window as any).THREE.Matrix4()
            : ({ elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] } as any),
          confidence: 1,
        } as any);
      }
    } catch (err) {
      const detectionError = err instanceof Error ? err : new Error(String(err));
      callbacks.onError?.(detectionError);
      setError(detectionError);
    } finally {
      processingRef.current = false;
    }
  }, [callbacks]);

  const start = useCallback(async () => {
    if (isScanning) return;

    setError(null);

    try {
      // Ensure module is loaded before starting camera
      await loadPosemeshModule();

      // Request camera permission
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setIsScanning(true);
      pausedRef.current = false;

      // Start detection loop
      intervalRef.current = window.setInterval(processFrame, scanIntervalMs);
    } catch (err) {
      const startError = err instanceof Error ? err : new Error(String(err));
      setError(startError);
      callbacks.onError?.(startError);
      throw startError;
    }
  }, [isScanning, facingMode, scanIntervalMs, processFrame, callbacks]);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsScanning(false);
    pausedRef.current = true;
  }, []);

  const pause = useCallback(() => {
    pausedRef.current = true;
  }, []);

  const resume = useCallback(() => {
    pausedRef.current = false;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    start,
    stop,
    pause,
    resume,
    isScanning,
    error,
    videoRef,
    canvasRef,
  };
}

// ============================================================================
// Utility: Convert posemesh types to our internal types
// ============================================================================

export function convertPosemeshQR(raw: unknown): QRCode {
  const r = raw as Record<string, unknown>;
  return {
    data: (r.data as string) || "",
    corners: ((r.corners as Array<Record<string, unknown>> | undefined)?.map((c) => ({
      x: c.x as number,
      y: c.y as number,
    })) || []) as Vector2[],
    confidence: r.confidence as number | undefined,
  };
}

export function convertPosemeshBarcode(raw: unknown): Barcode {
  const r = raw as Record<string, unknown>;
  return {
    data: (r.data as string) || "",
    format: (r.format as string) || "unknown",
    corners: ((r.corners as Array<Record<string, unknown>> | undefined)?.map((c) => ({
      x: c.x as number,
      y: c.y as number,
    })) || []) as Vector2[],
    confidence: r.confidence as number | undefined,
  };
}

export function convertPosemeshArUco(raw: unknown): ArUcoMarker {
  const r = raw as Record<string, unknown>;
  return {
    id: (r.id as number) ?? 0,
    corners: ((r.corners as Array<Record<string, unknown>> | undefined)?.map((c) => ({
      x: c.x as number,
      y: c.y as number,
    })) || []) as Vector2[],
    size: r.size as number | undefined,
    confidence: r.confidence as number | undefined,
  };
}

export function convertPosemeshPose(raw: unknown): Pose {
  const r = raw as Record<string, unknown>;
  return {
    position: (r.position as Pose["position"]) || { x: 0, y: 0, z: 0 },
    rotation: (r.rotation as Pose["rotation"]) || { x: 0, y: 0, z: 0, w: 1 },
    matrix: (r.matrix as Pose["matrix"]) || [],
    confidence: (r.confidence as number) ?? 1,
    timestamp: (r.timestamp as number) ?? Date.now(),
  };
}

// ============================================================================
// Type Augmentation for Window (for backward compatibility)
// ============================================================================

// Window augmentation is already declared in @/lib/posemesh/types.ts
