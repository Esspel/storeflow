"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import type { AukiPosemeshNetwork } from "@/lib/posemesh/auki-network";
import type { SpatialMap } from "@/lib/types/digital-twin";
import { getSpatialMap } from "@/lib/digital-twin";

interface Pose {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
}

interface UseARNetworkReturn {
  isConnecting: boolean;
  isConnected: boolean;
  error: Error | null;
  pose: Pose | null;
  domain: SpatialMap | null;
  network: AukiPosemeshNetwork | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  updatePose: (pose: Pose) => void;
}

interface Pose {
  x: number;
  y: number;
  z: number;
  q: { x: number; y: number; z: number; w: number };
}

export function useARNetwork(): UseARNetworkReturn {
  const { user, activeStore } = useAuth();
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [pose, setPose] = useState<Pose | null>(null);
  const [domain, setDomain] = useState<SpatialMap | null>(null);
  const networkRef = useRef<AukiPosemeshNetwork | null>(null);

  const initializeNetwork = useCallback(async () => {
    if (!activeStore?.id) {
      setError(new Error("No active store"));
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      const key = import.meta.env.VITE_AUKI_APP_KEY;
      const secret = import.meta.env.VITE_AUKI_APP_SECRET;

      if (!key || !secret) {
        throw new Error("Auki app credentials not configured. Please check VITE_AUKI_APP_KEY and VITE_AUKI_APP_SECRET environment variables.");
      }

      networkRef.current = new AukiPosemeshNetwork(key, secret);
      await networkRef.current.initialize();

      setIsConnected(true);

      // Load domain for current store
      const storeMap = await getSpatialMap(activeStore.id);
      setDomain(storeMap);

    } catch (err) {
      const initError = err instanceof Error ? err : new Error("Failed to initialize Auki network");
      setError(initError);
      console.error("Auki network initialization failed:", initError);
    } finally {
      setIsConnecting(false);
    }
  }, [activeStore?.id]);

  const disconnect = useCallback(() => {
    if (networkRef.current) {
      networkRef.current = null;
    }
    setIsConnected(false);
    setDomain(null);
    setPose(null);
  }, []);

  const updatePose = useCallback((newPose: Pose) => {
    setPose(newPose);
  }, []);

  // Auto-initialize on mount
  useEffect(() => {
    if (user && activeStore?.id && !networkRef.current) {
      initializeNetwork();
    }

    return () => {
      disconnect();
    };
  }, [user, activeStore?.id, initializeNetwork, disconnect]);

  return {
    isConnecting,
    isConnected,
    error,
    pose,
    domain,
    network: networkRef.current,
    connect: initializeNetwork,
    disconnect,
    updatePose,
  };
}
