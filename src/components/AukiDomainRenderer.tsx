/**
 * AukiDomainRenderer - Auki Domain-Viewer integration component
 * Renders the store's digital twin using ARNavigationView with pose alignment from posemesh network.
 */

"use client";

import { useEffect, useState, useRef } from "react";
import type { Pose } from "@/lib/posemesh/types";
import type { Marker3DConfig } from "@/lib/three-types";
import { ARNavigationView } from "@/components/ARNavigationView";
import { AukiPosemeshNetwork } from "@/lib/posemesh/auki-network";
import { getSpatialMap } from "@/lib/digital-twin";
import * as THREE from "three";
import "@/lib/three-patches"; // Ensure THREE.Clock available for R3F

interface SpatialMarker {
  id: string;
  name: string;
  type: "shelf" | "product" | "zone" | "entrance" | "exit" | "aisle";
  position: { x: number; y: number; z: number };
  rotation?: { x: number; y: number; z: number; w: number };
  metadata?: Record<string, unknown>;
}

interface SpatialMap {
  id: string;
  store_id: string;
  name: string;
  markers: SpatialMarker[];
  routes?: Array<{ from: string; to: string; distance: number }>;
}

interface AukiDomainRendererProps {
  network: AukiPosemeshNetwork;
  storeId: string;
  className?: string;
  onError?: (error: Error) => void;
}

export function AukiDomainRenderer({
  network,
  storeId,
  className,
  onError,
}: AukiDomainRendererProps) {
  const [domain, setDomain] = useState<SpatialMap | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [pose, setPose] = useState<{ position: { x: number; y: number; z: number } } | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    setIsLoading(true);

    // Load domain data from Supabase
    getSpatialMap(storeId)
      .then((data) => {
        if (isMounted.current) {
          setDomain(data);
          setIsOffline(false);
        }
      })
      .catch((err) => {
        console.error("Failed to load domain:", err);
        if (isMounted.current) {
          setIsOffline(true);
          onError?.(err instanceof Error ? err : new Error("Failed to load domain"));
        }
      })
      .finally(() => {
        if (isMounted.current) setIsLoading(false);
      });

    // Subscribe to pose updates from posemesh network
    const handlePoseUpdate = (newPose: Pose) => {
      if (!isMounted.current) return;
      setPose({
        position: {
          x: newPose.position.x,
          y: newPose.position.y,
          z: newPose.position.z,
        },
      });
    };

    if (network) {
      network.subscribeToPoseUpdates(handlePoseUpdate);
    } else {
      console.warn("AukiDomainRenderer: network is null, skipping pose subscription");
    }

    return () => {
      isMounted.current = false;
    };
  }, [network, storeId, onError]);

  if (isLoading) {
    return (
      <div
        className={className}
        data-testid="domain-renderer"
        style={{ backgroundColor: "#1a1a1a", display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        <div style={{ textAlign: "center", color: "#888" }}>
          <p>Laddar domändata...</p>
        </div>
      </div>
    );
  }

  if (isOffline || !domain) {
    return (
      <div
        className={className}
        data-testid="domain-renderer"
        style={{ backgroundColor: "#1a1a1a", display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        <div style={{ textAlign: "center", color: "#888" }}>
          <h3>Offline-läge</h3>
          <p>Domändata ej tillgänglig offline.</p>
        </div>
      </div>
    );
  }

  // Convert SpatialMarker to Marker3DConfig
  const markers: Marker3DConfig[] = domain.markers.map((m) => ({
    id: m.id,
    name: m.name,
    type: m.type,
    position: m.position,
    rotation: m.rotation,
    metadata: m.metadata,
  }));

  // Convert routes to navigation path
  const navigationPath =
    domain.routes && Array.isArray(domain.routes) && domain.routes.length > 0
      ? {
          waypoints: domain.routes.map((r) => ({
            x: 0,
            y: 0,
            z: 0,
          })),
          totalDistance: domain.routes.reduce((sum, r) => sum + r.distance, 0),
          estimatedTimeSeconds: domain.routes.reduce((sum, r) => sum + r.distance, 0) * 60,
          color: "#fbbf24",
        }
      : undefined;

  return (
    <div className={className} data-testid="domain-renderer" style={{ width: "100%", height: "100%" }}>
      <ARNavigationView
        markers={markers}
        navigationPath={navigationPath}
        targetMarkerId={undefined}
        userPose={pose}
        onMarkerSelect={() => {}}
        showDebug={false}
      />
    </div>
  );
}
