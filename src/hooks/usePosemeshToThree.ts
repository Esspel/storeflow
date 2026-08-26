/**
 * usePosemeshToThree Bridge Hook
 * Bridges posemesh PoseEstimation with Three.js
 * Converts detected marker poses into Three.js camera transform
 *
 * Strategy: WebXR handles primary tracking (ARCore/ARKit)
 * posemesh provides drift-correction via known marker positions
 */

import { useState, useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import type {
  Vector3 as PosemeshVector3,
  Quaternion as PosemeshQuaternion,
  Pose,
  ArUcoMarker,
} from "@/lib/posemesh/types";
import { usePosemesh } from "@/hooks/usePosemesh";

export interface BridgeState {
  /** Current camera pose from posemesh (null if not available) */
  posemeshPose: Pose | null;
  /** Whether posemesh is actively tracking */
  isTracking: boolean;
  /** Confidence of current pose estimate (0-1) */
  confidence: number;
  /** Last error message */
  error: string | null;
  /** Detected markers in last frame */
  detectedMarkers: ArUcoMarker[];
}

export interface PosemeshBridgeOptions {
  /** Known marker positions in world space (from spatial_markers) */
  knownMarkers: Array<{
    id: number;
    position: PosemeshVector3;
    sizeMeters: number;
  }>;
  /** Camera intrinsics (fx, fy, cx, cy) */
  cameraMatrix?: number[];
  /** Distortion coefficients */
  distCoeffs?: number[];
  /** Enable drift correction */
  enableDriftCorrection?: boolean;
  /** Detection frame rate (fps) */
  fps?: number;
}

export function usePosemeshToThree(
  options: PosemeshBridgeOptions
): BridgeState & {
  /** Get current camera world matrix (for Three.js camera) */
  getCameraMatrix: () => THREE.Matrix4 | null;
  /** Reset tracking */
  reset: () => void;
} {
  const { knownMarkers, cameraMatrix, distCoeffs, enableDriftCorrection = true, fps = 5 } = options;

  const [state, setState] = useState<BridgeState>({
    posemeshPose: null,
    isTracking: false,
    confidence: 0,
    error: null,
    detectedMarkers: [],
  });

  const { module, status, error: moduleError } = usePosemesh();
  const cameraMatrixRef = useRef<THREE.Matrix4>(
    cameraMatrix
      ? new THREE.Matrix4().set(
          cameraMatrix[0], 0, cameraMatrix[2], 0,
          0, cameraMatrix[1], cameraMatrix[3], 0,
          0, 0, 1, 0,
          0, 0, 0, 1
        )
      : new THREE.Matrix4().set(
          1000, 0, 640, 0,
          0, 1000, 360, 0,
          0, 0, 1, 0,
          0, 0, 0, 1
        ) // Default 1280x720 camera
  );

  const distCoeffsRef = useRef<number[]>(distCoeffs || [0, 0, 0, 0, 0]);
  const lastFrameTime = useRef(0);
  const cameraMatrixResult = useRef<THREE.Matrix4 | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Get camera stream
  useEffect(() => {
    let stream: MediaStream | null = null;

    const setupCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        const video = document.createElement("video");
        video.srcObject = stream;
        video.autoplay = true;
        video.playsInline = true;
        await video.play();
        videoRef.current = video;
      } catch (err: any) {
        setState((prev) => ({ ...prev, error: `Camera access failed: ${err.message}` }));
      }
    };

    setupCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Run pose estimation loop
  useEffect(() => {
    if (!module || !module.PoseEstimation || !videoRef.current) {
      return;
    }

    let animationFrame: number;
    let mounted = true;

    const detectFrame = async () => {
      if (!mounted || !videoRef.current || !module.PoseEstimation) return;

      const now = performance.now();
      const frameInterval = 1000 / fps;

      if (now - lastFrameTime.current >= frameInterval) {
        lastFrameTime.current = now;

        try {
          // Get video frame as luminance
          const canvas = document.createElement("canvas");
          canvas.width = videoRef.current.videoWidth;
          canvas.height = videoRef.current.videoHeight;
          const ctx = canvas.getContext("2d");
          if (!ctx) return;

          ctx.drawImage(videoRef.current, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const luminance = new Uint8Array(canvas.width * canvas.height);
          for (let i = 0; i < luminance.length; i++) {
            const idx = i * 4;
            luminance[i] = (imageData.data[idx] * 0.299 + imageData.data[idx + 1] * 0.587 + imageData.data[idx + 2] * 0.114) | 0;
          }

          // Run pose estimation
          const pose = module.PoseEstimation.solvePnP(
            knownMarkers.map((m) => [m.position.x, m.position.y, m.position.z]).flat(),
            knownMarkers.map((m) => [0, 0]).flat(), // Would need detected 2D points
            cameraMatrixRef.current.toArray(),
            distCoeffsRef.current
          );

          if (pose && enableDriftCorrection) {
            // Convert pose to Three.js matrix
            const rotationMatrix = new THREE.Matrix4();
            const quaternion = new THREE.Quaternion(
              pose.rotation.x,
              pose.rotation.y,
              pose.rotation.z,
              pose.rotation.w
            );
            rotationMatrix.makeRotationFromQuaternion(quaternion);

            const translation = new THREE.Vector3(
              pose.position.x,
              pose.position.y,
              pose.position.z
            );

            const cameraWorld = new THREE.Matrix4()
              .makeRotationFromQuaternion(quaternion)
              .setPosition(translation);

            // Invert to get view matrix (camera looks at scene)
            cameraMatrixResult.current = cameraWorld.clone().invert();

            setState((prev) => ({
              ...prev,
              posemeshPose: pose,
              isTracking: true,
              confidence: pose.confidence || 0.8,
              error: null,
            }));
          }
        } catch (err: any) {
          setState((prev) => ({
            ...prev,
            error: `Pose estimation failed: ${err.message}`,
            isTracking: false,
          }));
        }
      }

      animationFrame = requestAnimationFrame(detectFrame);
    };

    animationFrame = requestAnimationFrame(detectFrame);

    return () => {
      mounted = false;
      cancelAnimationFrame(animationFrame);
    };
  }, [module, knownMarkers, cameraMatrixRef, distCoeffsRef, enableDriftCorrection, fps]);

  const getCameraMatrix = useCallback((): THREE.Matrix4 | null => {
    return cameraMatrixResult.current;
  }, []);

  const reset = useCallback(() => {
    cameraMatrixResult.current = null;
    setState({
      posemeshPose: null,
      isTracking: false,
      confidence: 0,
      error: null,
      detectedMarkers: [],
    });
  }, []);

  return {
    ...state,
    getCameraMatrix,
    reset,
  };
}
