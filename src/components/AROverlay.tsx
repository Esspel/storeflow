/**
 * AROverlay - AR Overlay component combining camera background with 3D domain renderer
 * Handles camera permissions, stream initialization, and AR session lifecycle.
 */

"use client";

import { useState, useRef, useEffect } from "react";
import type { Pose } from "@/lib/posemesh/types";
import { AukiPosemeshNetwork } from "@/lib/posemesh/auki-network";
import { AukiDomainRenderer } from "@/components/AukiDomainRenderer";

interface AROverlayProps {
  network: AukiPosemeshNetwork;
  storeId: string;
  initialPose?: Pose;
  className?: string;
}

export function AROverlay({
  network,
  storeId,
  initialPose,
  className,
}: AROverlayProps) {
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Initialize camera stream on mount
  useEffect(() => {
    let mounted = true;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });

        if (mounted) {
          setCameraStream(stream);
          setCameraError(null);
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            await videoRef.current.play();
          }
        } else {
          stream.getTracks().forEach((track) => track.stop());
        }
      } catch (err) {
        console.error("Camera access failed:", err);
        if (mounted) {
          const errorMessage =
            err instanceof Error
              ? err.message
              : "Camera access denied or not available";
          setCameraError(errorMessage);
        }
      }
    }

    startCamera();

    return () => {
      mounted = false;
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [cameraStream]);

  const handleSessionStart = async () => {
    setIsSessionActive(true);
  };

  const handleSessionEnd = () => {
    setIsSessionActive(false);
  };

  return (
    <div
      className={`relative w-full h-full ${className || ""}`}
      data-testid="ar-overlay"
    >
      {/* Camera Background */}
      <div className="absolute inset-0 z-0 bg-coop-svart">
        {cameraStream && (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover"
            data-testid="camera-background"
          />
        )}

        {/* Fallback when camera is not available */}
        {!cameraStream && (
          <div className="absolute inset-0 flex items-center justify-center bg-coop-gray-900">
            <div className="text-white text-center p-4">
              {cameraError ? (
                <p>Kamera ej tillgänglig: {cameraError}</p>
              ) : (
                <p>Kamera ej tillgänglig. Visar 3D-vy.</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 3D Domain Renderer Overlay */}
      <div className="absolute inset-0 z-10 pointer-events-none">
        <AukiDomainRenderer
          network={network}
          storeId={storeId}
          className="w-full h-full"
        />
      </div>

      {/* AR Session Controls */}
      {!isSessionActive && !cameraStream && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20">
          <button
            onClick={handleSessionStart}
            className="px-6 py-3 bg-primary text-primary-foreground rounded-xl font-medium shadow-lg hover:shadow-xl transition-shadow"
            disabled
          >
            Start AR-session (kräver kamera)
          </button>
        </div>
      )}

      {!isSessionActive && cameraStream && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20">
          <button
            onClick={handleSessionStart}
            className="px-6 py-3 bg-primary text-primary-foreground rounded-xl font-medium shadow-lg hover:shadow-xl transition-shadow"
          >
            Start AR-session
          </button>
        </div>
      )}

      {isSessionActive && (
        <>
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-background/90 backdrop-blur rounded-xl px-4 py-2 shadow-lg border">
            <p className="text-sm font-medium text-foreground">
              AR aktiv — Kameraström + 3D-överlagring
            </p>
            <button
              onClick={handleSessionEnd}
              className="mt-2 text-xs text-primary hover:underline"
            >
              Avsluta session
            </button>
          </div>

          {/* AR status indicator */}
          <div className="absolute top-4 right-4 z-20 bg-coop-gron-500/90 backdrop-blur rounded-full px-3 py-1 shadow-lg border border-green-400">
            <span className="text-xs font-medium text-white flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-coop-gron-300 animate-pulse" />
              AR-SESSION
            </span>
          </div>
        </>
      )}
    </div>
  );
}