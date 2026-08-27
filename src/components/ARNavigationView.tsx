/**
 * ARNavigationView - AR Navigation Component using WebXR
 * Renders markers and navigation path in augmented reality
 * Works with WebXR on Android Chrome (ARCore) and iOS Safari (WebXR Viewer)
 */

"use client";

import { useMemo, useRef, useCallback, useEffect, useState } from "react";
import {
  Canvas, useFrame, useThree
} from "@react-three/fiber";
import {
  Html,
  useGLTF,
  Line,
} from "@react-three/drei";
import { BoxGeometry, CylinderGeometry, PlaneGeometry, TorusGeometry } from "three";
import * as THREE from "three";
import "@/lib/three-patches"; // Ensure THREE.Clock available for R3F
import {
  ARNavigationViewProps,
  Marker3DConfig,
  NavigationPath3D,
  MarkerType,
  MARKER_VISUAL_CONFIG,
  SELECTION_COLORS,
} from "@/lib/three-types";
import { MARKER_VISUAL_CONFIG as _MVC, SELECTION_COLORS as _SC } from "@/lib/three-types";
import { useARSession } from "@/hooks/useARSession";

// ============================================================================
// AR Marker Component
// ============================================================================

interface ARMarkerProps {
  marker: Marker3DConfig;
  onSelect?: (markerId: string) => void;
  isTarget: boolean;
  isUserPosition: boolean;
}

function ARMarker({
  marker,
  onSelect,
  isTarget,
  isUserPosition,
}: ARMarkerProps) {
  const config = MARKER_VISUAL_CONFIG[marker.type];
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  const getColor = useCallback(() => {
    if (isUserPosition) return (_SC as any).userPosition;
    if (isTarget) return (_SC as any).target;
    if (hovered) return (_SC as any).selected;
    return config.color;
  }, [config.color, isTarget, isUserPosition, hovered]);

  const color = getColor();

  useFrame((_, delta) => {
    if (meshRef.current && (isTarget || isUserPosition)) {
      const pulse = 1 + Math.sin(performance.now() * 0.003) * 0.15;
      meshRef.current.scale.setScalar(pulse);
    } else if (meshRef.current) {
      meshRef.current.scale.setScalar(1);
    }
  });

  const handleClick = (event: any) => {
    event?.stopPropagation?.();
    onSelect?.(marker.id);
  };

  const handlePointerOver = () => setHovered(true);
  const handlePointerOut = () => setHovered(false);

  const renderGeometry = () => {
    const [w, h, d] = config.size;
    const baseProps: any = {
      ref: meshRef,
      position: [marker.position.x, marker.position.y + h / 2, marker.position.z] as [number, number, number],
      rotation: marker.rotation ? [marker.rotation.x, marker.rotation.y, marker.rotation.z] as [number, number, number] : undefined,
      onClick: handleClick,
      onPointerOver: handlePointerOver,
      onPointerOut: handlePointerOut,
      castShadow: true,
      receiveShadow: true,
    };

    switch (config.geometry) {
      case "box":
        return (
          <mesh
            {...baseProps}
            args={[w, h, d]}
          />
        );
      case "cylinder":
        return (
          <mesh
            {...baseProps}
            args={[config.size[0], config.size[0], config.size[1], config.size[2]]}
          />
        );
      case "plane":
        return (
          <mesh
            {...baseProps}
            args={[config.size[0], config.size[2]]}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[marker.position.x, marker.position.y + 0.01, marker.position.z]}
          />
        );
      case "torus":
        return (
          <mesh
            {...baseProps}
            args={[config.size[0], config.size[1], config.size[2], (config.size as number[])[3] ?? 16]}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[marker.position.x, marker.position.y + 0.05, marker.position.z]}
          />
        );
      default:
        return (
          <mesh
            {...baseProps}
            args={[w, h, d, 0.05]}
          />
        );
    }
  };

  return (
    <group>
      {renderGeometry()}
      {/* AR label - always facing camera */}
      <Html
        position={[marker.position.x, marker.position.y + config.size[1] + 0.4, marker.position.z]}
        wrapperClass="ar-marker-label"
        style={{
          transform: "translate(-50%, -100%)",
          fontSize: "14px",
          fontWeight: 600,
          color: "#ffffff",
          background: "rgba(0, 0, 0, 0.8)",
          padding: "4px 10px",
          borderRadius: "8px",
          whiteSpace: "nowrap",
          boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
          pointerEvents: "none",
          border: isTarget || isUserPosition ? "2px solid" : "none",
          borderColor: isTarget ? (_SC as any).target : (_SC as any).userPosition,
        }}
      >
        {marker.name}
      </Html>
    </group>
  );
}

// ============================================================================
// Navigation Path Component
// ============================================================================

interface NavigationPathProps {
  path: NavigationPath3D;
}

function NavigationPath({ path }: NavigationPathProps) {
  const points = path.waypoints.map((p) => new THREE.Vector3(p.x, p.y + 0.1, p.z));
  const lineRef = useRef<THREE.Line>(null);

  useFrame(() => {
    if (lineRef.current && "dashOffset" in (lineRef.current.material || {})) {
      const mat = lineRef.current.material as any;
      mat.dashOffset = (mat.dashOffset || 0) - 0.02;
    }
  });

  return (
    <Line
      ref={lineRef as any}
      points={points}
      color={path.color ?? "#fbbf24"}
      lineWidth={4}
    />
  );
}

// ============================================================================
// Arrow Component (direction indicator)
// ============================================================================

interface ArrowProps {
  position: THREE.Vector3;
  direction: THREE.Vector3;
  color?: string;
}

function Arrow({ position, direction, color = "#fbbf24" }: ArrowProps) {
  const arrowRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (arrowRef.current) {
      const rotation = new THREE.Euler().setFromVector3(direction);
      arrowRef.current.rotation.copy(rotation);
    }
  });

  return (
    <mesh
      ref={arrowRef as any}
      position={[position.x, position.y + 0.5, position.z]}
      rotation={[-Math.PI / 2, 0, 0]}
      scale={[0.3, 0.3, 0.3]}
    >
      <coneGeometry args={[0.3, 1, 4]} />
      <meshBasicMaterial color={color} transparent opacity={0.8} />
    </mesh>
  );
}

// ============================================================================
// Main ARNavigationView Component
// ============================================================================

export function ARNavigationView({
  markers,
  navigationPath,
  targetMarkerId,
  userPose,
  onSessionStart,
  onSessionEnd,
  onMarkerSelect,
  showDebug = false,
}: ARNavigationViewProps) {
  const { session, startSession, endSession } = useARSession() as any;
  const [isSessionActive, setIsSessionActive] = useState(false);

  // Handle session lifecycle
  useEffect(() => {
    if (session && !isSessionActive) {
      setIsSessionActive(true);
      onSessionStart?.();
    } else if (!session && isSessionActive) {
      setIsSessionActive(false);
      onSessionEnd?.();
    }
  }, [session, isSessionActive, onSessionStart, onSessionEnd]);

  // Filter markers for display
  const displayMarkers = useMemo(() => {
    return markers.map((marker) => ({
      ...marker,
      isTarget: marker.id === targetMarkerId,
      isUserPosition: false,
    }));
  }, [markers, targetMarkerId]);

  // Find target marker position for path
  const targetMarker = useMemo(
    () => markers.find((m) => m.id === targetMarkerId),
    [markers, targetMarkerId]
  );

  return (
    <div className="relative w-full h-full">
      <Canvas
        camera={{ position: [0, 1.6, 0], fov: 60, near: 0.01, far: 100 }}
        gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
        onCreated={({ gl }) => {
          gl.xr.enabled = true;
        }}
        className="w-full h-full"
      >
        <color attach="background" args={["#000000"]} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[10, 20, 10]} intensity={1} castShadow />

        {/* Floor grid for reference */}
        <gridHelper args={[20, 20, "#444444", "#888888"]} />

        {/* Navigation path */}
        {navigationPath && <NavigationPath path={navigationPath} />}

        {/* Arrow pointing to target */}
        {targetMarker && userPose && (
          <Arrow
            position={new THREE.Vector3(userPose.position.x, userPose.position.y, userPose.position.z)}
            direction={new THREE.Vector3(
              targetMarker.position.x - userPose.position.x,
              0,
              targetMarker.position.z - userPose.position.z
            ).normalize()}
          />
        )}

        {/* Markers */}
        {displayMarkers.map((marker) => (
          <ARMarker
            key={marker.id}
            marker={marker}
            onSelect={onMarkerSelect}
            isTarget={marker.isTarget}
            isUserPosition={marker.isUserPosition}
          />
        ))}

        {/* User position marker */}
        {userPose && (
          <ARMarker
            marker={{
              id: "user-position",
              name: "Din position",
              type: "entrance",
              position: { x: userPose.position.x, y: userPose.position.y, z: userPose.position.z },
              isUserPosition: true,
            }}
            isTarget={false}
            isUserPosition={true}
          />
        )}
      </Canvas>

      {/* AR Session Controls */}
      {!isSessionActive && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
          <button
            onClick={() => startSession()}
            className="px-6 py-3 bg-primary text-primary-foreground rounded-xl font-medium shadow-lg hover:shadow-xl transition-shadow"
          >
            Starta AR-navigation
          </button>
        </div>
      )}

      {isSessionActive && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-background/90 backdrop-blur rounded-xl px-4 py-2 shadow-lg border">
          <p className="text-sm font-medium text-foreground">
            AR-aktiv — gå runt för att navigera
          </p>
          <button
            onClick={() => endSession()}
            className="mt-2 text-xs text-primary hover:underline"
          >
            Avsluta session
          </button>
        </div>
      )}

      {showDebug && (
        <div className="absolute bottom-4 right-4 z-10 bg-background/90 backdrop-blur rounded-lg p-3 shadow-lg border text-xs font-mono">
          <div>Markörer: {markers.length}</div>
          <div>Sökväg: {navigationPath ? "Ja" : "Nej"}</div>
          <div>Mål: {targetMarkerId ?? "Inget"}</div>
          <div>Session: {isSessionActive ? "Aktiv" : "Inaktiv"}</div>
        </div>
      )}
    </div>
  );
}