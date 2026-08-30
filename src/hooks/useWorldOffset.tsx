import "@/lib/three-patches"; // Ensure THREE.Clock available for R3F
/**
 * useWorldOffset Hook
 * Provides a React context for the world offset transform
 * This bridges posemesh absolute positioning with WebXR local tracking
 *
 * Architecture:
 * - WebXR provides smooth local 6DoF tracking (local space)
 * - posemesh provides periodic absolute pose in store coordinates (world space)
 * - WorldOffset = worldToLocal transform applied to scene root
 * - NOT applied to camera (would break WebXR tracking)
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  ReactNode,
} from "react";
import * as THREE from "three";
import type { Vector3, Quaternion } from "@/lib/posemesh/types";

// ============================================================================
// Types
// ============================================================================

export interface WorldOffsetState {
  /** Transform from WebXR local space to Store world space */
  matrix: THREE.Matrix4 | null;
  /** Inverse transform (world to local) */
  inverseMatrix: THREE.Matrix4 | null;
  /** Whether offset is valid (has been initialized) */
  isValid: boolean;
  /** Last update timestamp */
  lastUpdate: number | null;
  /** Source of last update */
  source: "posemesh" | "manual" | null;
  /** Confidence of current offset (0-1) */
  confidence: number;
}

export interface WorldOffsetActions {
  /** Set offset from posemesh absolute pose */
  setFromPosemesh: (
    worldPose: { position: Vector3; rotation: Quaternion },
    confidence?: number,
  ) => void;
  /** Set offset manually (e.g., from QR code scan) */
  setManually: (matrix: THREE.Matrix4) => void;
  /** Reset offset */
  reset: () => void;
  /** Apply offset to a Three.js object (scene root) */
  applyToObject: (object: THREE.Object3D) => void;
}

// ============================================================================
// Context
// ============================================================================

interface WorldOffsetContextValue extends WorldOffsetState, WorldOffsetActions {}

const WorldOffsetContext = createContext<WorldOffsetContextValue | null>(null);

// ============================================================================
// Provider Component
// ============================================================================

interface WorldOffsetProviderProps {
  children: ReactNode;
  /** Initial offset (optional) */
  initialMatrix?: THREE.Matrix4;
}

export function WorldOffsetProvider({ children, initialMatrix }: WorldOffsetProviderProps) {
  const [state, setState] = useState<WorldOffsetState>({
    matrix: initialMatrix || null,
    inverseMatrix: initialMatrix ? initialMatrix.clone().invert() : null,
    isValid: !!initialMatrix,
    lastUpdate: initialMatrix ? Date.now() : null,
    source: initialMatrix ? "manual" : null,
    confidence: initialMatrix ? 1.0 : 0,
  });

  const setFromPosemesh = useCallback(
    (worldPose: { position: Vector3; rotation: Quaternion }, confidence = 0.8) => {
      // Create world matrix from posemesh pose
      const worldMatrix = new THREE.Matrix4();
      const quaternion = new THREE.Quaternion(
        worldPose.rotation.x,
        worldPose.rotation.y,
        worldPose.rotation.z,
        worldPose.rotation.w,
      );
      worldMatrix.makeRotationFromQuaternion(quaternion);
      worldMatrix.setPosition(worldPose.position.x, worldPose.position.y, worldPose.position.z);

      // World offset = worldToLocal (inverse of world matrix)
      // This transforms WebXR local coordinates to store world coordinates
      const offsetMatrix = worldMatrix.clone().invert();

      setState({
        matrix: offsetMatrix,
        inverseMatrix: worldMatrix,
        isValid: true,
        lastUpdate: Date.now(),
        source: "posemesh",
        confidence,
      });
    },
    [],
  );

  const setManually = useCallback((matrix: THREE.Matrix4) => {
    setState({
      matrix: matrix.clone(),
      inverseMatrix: matrix.clone().invert(),
      isValid: true,
      lastUpdate: Date.now(),
      source: "manual",
      confidence: 1.0,
    });
  }, []);

  const reset = useCallback(() => {
    setState({
      matrix: null,
      inverseMatrix: null,
      isValid: false,
      lastUpdate: null,
      source: null,
      confidence: 0,
    });
  }, []);

  const applyToObject = useCallback(
    (object: THREE.Object3D) => {
      if (state.matrix && state.isValid) {
        // Apply world offset to scene root
        // This shifts the entire scene so WebXR (0,0,0) maps to store origin
        object.matrix.premultiply(state.matrix);
        object.matrixAutoUpdate = false; // We control the matrix
        object.matrix.decompose(object.position, object.quaternion, object.scale);
      }
    },
    [state.matrix, state.isValid],
  );

  const value = useMemo<WorldOffsetContextValue>(
    () => ({
      ...state,
      setFromPosemesh,
      setManually,
      reset,
      applyToObject,
    }),
    [state, setFromPosemesh, setManually, reset, applyToObject],
  );

  return <WorldOffsetContext.Provider value={value}>{children}</WorldOffsetContext.Provider>;
}

// ============================================================================
// Consumer Hook
// ============================================================================

export function useWorldOffset(): WorldOffsetContextValue {
  const context = useContext(WorldOffsetContext);
  if (!context) {
    throw new Error("useWorldOffset must be used within WorldOffsetProvider");
  }
  return context;
}

// ============================================================================
// Bridge Hook (consumes posemesh, updates world offset)
// ============================================================================

import { usePosemesh } from "@/hooks/usePosemesh";
import type { ArUcoMarker, Pose } from "@/lib/posemesh/types";

export interface PosemeshBridgeOptions {
  /** Known marker positions in store world coordinates */
  knownMarkers: Array<{
    id: number;
    position: Vector3;
    sizeMeters: number;
  }>;
  /** Camera intrinsics matrix (3x3 flattened) */
  cameraMatrix?: number[];
  /** Distortion coefficients */
  distCoeffs?: number[];
  /** Minimum detection confidence */
  minConfidence?: number;
  /** Detection interval (ms) - lower fps to save battery */
  detectionInterval?: number;
  /** Enable the bridge */
  enabled?: boolean;
}

/**
 * Bridge hook: runs posemesh detection on separate video stream,
 * computes world offset, updates WorldOffsetContext
 *
 * IMPORTANT: This runs on a separate <video> element, NOT the WebXR camera.
 * WebXR camera is not accessible for computer vision.
 */
export function usePosemeshBridge(options: PosemeshBridgeOptions) {
  const {
    knownMarkers,
    cameraMatrix,
    distCoeffs,
    minConfidence = 0.5,
    detectionInterval = 2000, // 0.5 Hz - very low to save battery
    enabled = true,
  } = options;

  const { setFromPosemesh } = useWorldOffset();
  const { module, status } = usePosemesh() as any;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastDetectionTime = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Setup camera stream
  useEffect(() => {
    if (!enabled) return;

    let stream: MediaStream | null = null;
    let mounted = true;

    const setupCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        const video = document.createElement("video");
        video.srcObject = stream;
        video.autoplay = true;
        video.playsInline = true;
        video.style.display = "none"; // Hidden background video
        document.body.appendChild(video);
        await video.play();
        videoRef.current = video;

        // Create canvas for luminance extraction
        const canvas = document.createElement("canvas");
        canvas.width = 1280;
        canvas.height = 720;
        canvas.style.display = "none";
        document.body.appendChild(canvas);
        canvasRef.current = canvas;
      } catch (err: any) {
        console.error("Posemesh bridge: Camera access failed:", err);
      }
    };

    setupCamera();

    return () => {
      mounted = false;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      if (videoRef.current) {
        videoRef.current.remove();
        videoRef.current = null;
      }
      if (canvasRef.current) {
        canvasRef.current.remove();
        canvasRef.current = null;
      }
    };
  }, [enabled]);

  // Detection loop
  useEffect(() => {
    if (!enabled || !module?.PoseEstimation || !module?.ArucoDetection || !videoRef.current) {
      return;
    }

    let animationFrame: number;
    let mounted = true;

    const detectFrame = () => {
      if (!mounted || !videoRef.current || !module.PoseEstimation || !module.ArucoDetection) {
        animationFrame = requestAnimationFrame(detectFrame);
        return;
      }

      const now = Date.now();
      if (now - lastDetectionTime.current >= detectionInterval) {
        lastDetectionTime.current = now;

        try {
          const video = videoRef.current;
          const canvas = canvasRef.current;
          if (!canvas || video.videoWidth === 0) {
            animationFrame = requestAnimationFrame(detectFrame);
            return;
          }

          // Draw video frame to canvas
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            animationFrame = requestAnimationFrame(detectFrame);
            return;
          }
          ctx.drawImage(video, 0, 0);

          // Extract luminance
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const luminance = new Uint8Array(canvas.width * canvas.height);
          for (let i = 0; i < luminance.length; i++) {
            const idx = i * 4;
            luminance[i] =
              (imageData.data[idx] * 0.299 +
                imageData.data[idx + 1] * 0.587 +
                imageData.data[idx + 2] * 0.114) |
              0;
          }

          // Detect ArUco markers
          const markers = module.ArucoDetection.detectArucoFromLuminance(
            luminance,
            canvas.width,
            canvas.height,
          );

          if (markers.length >= 4) {
            // Match detected markers to known markers
            const matchedMarkers = markers
              .filter((m: any) => m.confidence && m.confidence >= minConfidence)
              .map((m: any) => {
                const known = knownMarkers.find((km) => km.id === m.id);
                return known
                  ? { ...m, knownPosition: known.position, knownSize: known.sizeMeters }
                  : null;
              })
              .filter(
                (m: any): m is ArUcoMarker & { knownPosition: Vector3; knownSize: number } =>
                  m !== null,
              );

            if (matchedMarkers.length >= 4) {
              // Solve PnP for camera pose in world coordinates
              const objectPoints: number[] = [];
              const imagePoints: number[] = [];

              for (const m of matchedMarkers) {
                const halfSize = m.knownSize / 2;
                // Marker corners in world space (assuming marker lies flat on Y=0 plane)
                const corners = [
                  {
                    x: m.knownPosition.x - halfSize,
                    y: m.knownPosition.y,
                    z: m.knownPosition.z - halfSize,
                  },
                  {
                    x: m.knownPosition.x + halfSize,
                    y: m.knownPosition.y,
                    z: m.knownPosition.z - halfSize,
                  },
                  {
                    x: m.knownPosition.x + halfSize,
                    y: m.knownPosition.y,
                    z: m.knownPosition.z + halfSize,
                  },
                  {
                    x: m.knownPosition.x - halfSize,
                    y: m.knownPosition.y,
                    z: m.knownPosition.z + halfSize,
                  },
                ];
                for (const c of corners) {
                  objectPoints.push(c.x, c.y, c.z);
                }
                // Image points from detection
                for (const corner of m.corners) {
                  imagePoints.push(corner.x, corner.y);
                }
              }

              const camMatrix = cameraMatrix || [1000, 0, 640, 0, 1000, 360, 0, 0, 1];
              const distC = distCoeffs || [0, 0, 0, 0, 0];

              const pose = module.PoseEstimation.solvePnP(
                objectPoints,
                imagePoints,
                camMatrix,
                distC,
              );

              if (pose) {
                // Convert to world offset
                setFromPosemesh(
                  { position: pose.position, rotation: pose.rotation },
                  pose.confidence || 0.8,
                );
              }
            }
          }
        } catch (err) {
          console.error("Posemesh bridge detection error:", err);
        }
      }

      animationFrame = requestAnimationFrame(detectFrame);
    };

    animationFrame = requestAnimationFrame(detectFrame);

    return () => {
      mounted = false;
      cancelAnimationFrame(animationFrame);
    };
  }, [
    enabled,
    module,
    knownMarkers,
    cameraMatrix,
    distCoeffs,
    minConfidence,
    detectionInterval,
    setFromPosemesh,
  ]);

  return { status };
}

import { useRef } from "react";
