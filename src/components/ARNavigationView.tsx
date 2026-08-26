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
  Box,
  Cylinder,
  Plane,
  Torus,
  RoundedBox,
  Html,
  useGLTF,
} from "@react-three/drei";
import * as THREE from "three";
import {
  ARNavigationViewProps,
  Marker3DConfig,
  NavigationPath3D,
  MarkerType,
  MARKER_VISUAL_CONFIG,
  SELECTION_COLORS,
} from "@/lib/three-types";
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
    if (isUserPosition) return SELECTION_COLORS.userPosition;
    if (isTarget) return SELECTION_COLORS.target;
    if (hovered) return SELECTION_COLORS.selected;
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

  const handleClick = (event: THREE.Event) => {
    event.stopPropagation();
    onSelect?.(marker.id);
  };

  const handlePointerOver = () => setHovered(true);
  const handlePointerOut = () => setHovered(false);

  const renderGeometry = () => {
    const [w, h, d] = config.size;
    const baseProps = {
      ref: meshRef,
      position: [marker.position.x, marker.position.y + h / 2, marker.position.z],
      rotation: marker.rotation ? [marker.rotation.x, marker.rotation.y, marker.rotation.z] : undefined,
      onClick: handleClick,
      onPointerOver: handlePointerOver,
      onPointerOut: handlePointerOut,
      castShadow: true,
      receiveShadow: true,
    };

    switch (config.geometry) {
      case "box":
        return (
          <Box
            {...baseProps}
            args={[w, h, d]}
            color={color}
            opacity={config.opacity}
            transparent={config.opacity !== undefined && config.opacity < 1}
          />
        );
      case "cylinder":
        return (
          <Cylinder
            {...baseProps}
            args={[config.size[0], config.size[0], config.size[1], config.size[2]]}
            color={color}
            opacity={config.opacity}
            transparent={config.opacity !== undefined && config.opacity < 1}
          />
        );
      case "plane":
        return (
          <Plane
            {...baseProps}
            args={[config.size[0], config.size[2]]}
            color={color}
            opacity={config.opacity}
            transparent={config.opacity !== undefined && config.opacity < 1}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[marker.position.x, marker.position.y + 0.01, marker.position.z]}
          />
        );
      case "torus":
        return (
          <Torus
            {...baseProps}
            args={[config.size[0], config.size[1], config.size[2], config.size[3]]}
            color={color}
            opacity={config.opacity}
            transparent={config.opacity !== undefined && config.opacity < 1}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[marker.position.x, marker.position.y + 0.05, marker.position.z]}
          />
        );
      default:
        return (
          <RoundedBox
            {...baseProps}
            args={[w, h, d, 0.05]}
            color={color}
            opacity={config.opacity}
            transparent={config.opacity !== undefined && config.opacity < 1}
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
          borderColor: isTarget ? SELECTION_COLORS.target : SELECTION_COLORS.userPosition,
        }}
        fullscreen
        distanceFactor={5}
        zIndexRange={[100, 200]}
      >
        {marker.name}
        {isTarget && " 🎯"}
        {isUserPosition && " 📍"}
      </Html>
    </group>
  );
}

// ============================================================================
// AR Navigation Path Component
// ============================================================================

interface ARNavigationPathProps {
  path: NavigationPath3D;
}

function ARNavigationPath({ path }: ARNavigationPathProps) {
  const points = useMemo(
    () => path.waypoints.map((wp) => new THREE.Vector3(wp.x, wp.y + 0.05, wp.z)),
    [path.waypoints]
  );

  const lineRef = useRef<THREE.Line>(null);

  useFrame(() => {
    if (lineRef.current) {
      const dashOffset = (performance.now() * 0.0015) % 1;
      const material = lineRef.current.material as THREE.LineDashedMaterial;
      if (material) material.dashOffset = dashOffset;
    }
  });

  return (
    <line
      ref={lineRef}
      points={points}
      color={path.color || SELECTION_COLORS.path}
      lineWidth={6}
      dashed
      dashSize={0.4}
      gapSize={0.2}
    >
      <lineDashedMaterial
        attach="material"
        color={path.color || SELECTION_COLORS.path}
        dashSize={0.4}
        gapSize={0.2}
        transparent
        opacity={0.9}
        depthTest={false}
        depthWrite={false}
      />
    </line>
  );
}

// ============================================================================
// Waypoint Markers (arrows on path)
// ============================================================================

interface WaypointMarkersProps {
  path: NavigationPath3D;
}

function WaypointMarkers({ path }: WaypointMarkersProps) {
  if (!path.waypoints || path.waypoints.length < 2) return null;

  return (
    <group name="waypoints">
      {path.waypoints.slice(1, -1).map((wp, index) => (
        <group
          key={`waypoint-${index}`}
          position={[wp.x, wp.y + 0.5, wp.z]}
          rotation={[0, 0, 0]}
        >
          {/* Arrow cone pointing to next waypoint */}
          <cone
            args={[0.2, 0.5, 8]}
            position={[0, 0.25, 0]}
            color={path.color || SELECTION_COLORS.path}
            opacity={0.8}
            transparent
          />
          <Html
            position={[0, -0.3, 0]}
            style={{
              transform: "translate(-50%, -100%)",
              fontSize: "12px",
              color: "#ffffff",
              background: "rgba(0,0,0,0.7)",
              padding: "2px 6px",
              borderRadius: "4px",
              whiteSpace: "nowrap",
            }}
            fullscreen
            distanceFactor={5}
          >
            {Math.round(
              Math.sqrt(
                Math.pow(wp.x - path.waypoints[index + 1].x, 2) +
                  Math.pow(wp.z - path.waypoints[index + 1].z, 2)
              ) * 100
            ) / 100}m
          </Html>
        </group>
      ))}
    </group>
  );
}

// ============================================================================
// Debug Info Overlay
// ============================================================================

interface DebugInfoProps {
  session: XRSession | null;
  userPose: { position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number; w: number } } | null;
  targetMarkerId?: string;
}

function DebugInfo({ session, userPose, targetMarkerId }: DebugInfoProps) {
  return (
    <Html
      position={[0, -1.5, -1]}
      rotation={[-Math.PI / 6, 0, 0]}
      style={{
        transform: "translate(-50%, -50%)",
        fontSize: "12px",
        fontFamily: "monospace",
        color: "#10b981",
        background: "rgba(0, 0, 0, 0.8)",
        padding: "10px",
        borderRadius: "8px",
        pointerEvents: "none",
        minWidth: "200px",
        lineHeight: "1.6",
      }}
      fullscreen
      distanceFactor={2}
    >
      <div>AR Session: {session ? "🟢 Active" : "🔴 Inactive"}</div>
      <div>Tracking: {session?.visibilityState || "unknown"}</div>
      {userPose && (
        <>
          <div>Pos: ({userPose.position.x.toFixed(2)}, {userPose.position.y.toFixed(2)}, {userPose.position.z.toFixed(2)})</div>
          <div>Rot: ({userPose.rotation.x.toFixed(2)}, {userPose.rotation.y.toFixed(2)}, {userPose.rotation.z.toFixed(2)}, {userPose.rotation.w.toFixed(2)})</div>
        </>
      )}
      {targetMarkerId && <div>Target: {targetMarkerId}</div>}
    </Html>
  );
}

// ============================================================================
// AR Session Canvas (runs inside WebXR)
// ============================================================================

function ARSessionCanvas({
  markers,
  navigationPath,
  targetMarkerId,
  userPose,
  onMarkerSelect,
  showDebug,
}: Omit<ARNavigationViewProps, "onSessionStart" | "onSessionEnd">) {
  const { scene, camera } = useThree();

  // Set camera to identity - WebXR controls it
  useFrame(() => {
    camera.matrixAutoUpdate = false;
    camera.matrix.identity();
    camera.matrixWorld.identity();
    camera.projectionMatrix.identity();
    // WebXR will update these
  });

  return (
    <>
      {/* Lighting - subtle in AR */}
      <ambientLight intensity={0.6} color="#ffffff" />
      <directionalLight
        position={[0, 5, 2]}
        intensity={0.8}
        color="#ffffff"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />

      {/* Markers */}
      <group name="ar-markers">
        {markers.map((marker) => (
          <ARMarker
            key={marker.id}
            marker={marker}
            onSelect={onMarkerSelect}
            isTarget={marker.id === targetMarkerId}
            isUserPosition={marker.isUserPosition}
          />
        ))}
      </group>

      {/* Navigation path */}
      {navigationPath && navigationPath.waypoints.length > 1 && (
        <>
          <ARNavigationPath path={navigationPath} />
          <WaypointMarkers path={navigationPath} />
        </>
      )}

      {/* User position indicator */}
      {userPose && (
        <group name="user-position">
          <Cylinder
            args={[0.3, 0.3, 0.05, 16]}
            position={[userPose.position.x, 0.025, userPose.position.z]}
            color={SELECTION_COLORS.userPosition}
            opacity={0.5}
            transparent
          />
          <Torus
            args={[0.4, 0.03, 8, 16]}
            position={[userPose.position.x, 0.08, userPose.position.z]}
            rotation={[-Math.PI / 2, 0, 0]}
            color={SELECTION_COLORS.userPosition}
            opacity={0.8}
          />
        </group>
      )}

      {/* Debug info */}
      {showDebug && <DebugInfo session={session} userPose={userPose} targetMarkerId={targetMarkerId} />}
    </>
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
  const {
    state,
    session,
    features,
    error,
    startSession,
    endSession,
    isSupported,
  } = useARSession();

  const [arError, setArError] = useState<string | null>(null);
  const sessionStartedRef = useRef(false);

  // Handle session start callback
  useEffect(() => {
    if (session && !sessionStartedRef.current) {
      sessionStartedRef.current = true;
      onSessionStart?.();
    } else if (!session && sessionStartedRef.current) {
      sessionStartedRef.current = false;
      onSessionEnd?.();
    }
  }, [session, onSessionStart, onSessionEnd]);

  // Handle errors
  useEffect(() => {
    if (error) {
      setArError(error);
    }
  }, [error]);

  // Not supported fallback
  if (!isSupported) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          minHeight: "400px",
          padding: "20px",
          background: "#fef3c7",
          border: "1px solid #f59e0b",
          borderRadius: "8px",
          color: "#92400e",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: "48px", marginBottom: "16px" }}>📱</div>
        <h3 style={{ margin: "0 0 8px", fontSize: "18px" }}>AR inte tillgängligt</h3>
        <p style={{ margin: "0 0 16px", fontSize: "14px" }}>
          WebXR stöds inte i denna webbläsare. Använd Chrome på Android eller
          WebXR Viewer på iOS för AR-upplevelse.
        </p>
        <button
          onClick={() => {}}
          style={{
            padding: "10px 20px",
            background: "#f59e0b",
            color: "white",
            border: "none",
            borderRadius: "6px",
            fontSize: "14px",
            fontWeight: 600,
            cursor: "pointer",
          }}
          disabled
        >
          Visa 3D-vy istället
        </button>
      </div>
    );
  }

  // Session states
  const isActive = state === "active";
  const isRequesting = state === "requesting";

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      {/* AR Button / Status */}
      <div
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          right: 16,
          zIndex: 100,
          display: "flex",
          gap: 8,
          justifyContent: "center",
        }}
      >
        {isActive && (
          <button
            onClick={endSession}
            style={{
              padding: "8px 16px",
              background: "#ef4444",
              color: "white",
              border: "none",
              borderRadius: "20px",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
            }}
          >
            Avsluta AR
          </button>
        )}

        {!isActive && state === "available" && (
          <button
            onClick={() => startSession()}
            disabled={isRequesting}
            style={{
              padding: "8px 16px",
              background: "#3b82f6",
              color: "white",
              border: "none",
              borderRadius: "20px",
              fontSize: "13px",
              fontWeight: 600,
              cursor: isRequesting ? "not-allowed" : "pointer",
              opacity: isRequesting ? 0.6 : 1,
              boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
            }}
          >
            {isRequesting ? "Startar AR..." : "Starta AR-navigation"}
          </button>
        )}

        {state === "error" && (
          <div
            style={{
              padding: "8px 16px",
              background: "#fef2f2",
              color: "#dc2626",
              border: "1px solid #fecaca",
              borderRadius: "20px",
              fontSize: "13px",
              maxWidth: "300px",
            }}
          >
            {arError || "AR-fel"}
          </div>
        )}
      </div>

      {/* Instructions overlay when not active */}
      {!isActive && state === "available" && (
        <div
          style={{
            position: "absolute",
            bottom: 100,
            left: 16,
            right: 16,
            zIndex: 50,
            textAlign: "center",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              display: "inline-block",
              background: "rgba(0, 0, 0, 0.8)",
              color: "white",
              padding: "16px 24px",
              borderRadius: "12px",
              fontSize: "14px",
              lineHeight: 1.5,
              maxWidth: "400px",
              boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: "8px", fontSize: "16px" }}>
              📸 AR Navigation
            </div>
            <div>
              Pekera kameran mot markörerna (ArUco-koder) i butiken för att
              starta navigation. Följ pilarna för att hitta din produkt.
            </div>
          </div>
        </div>
      )}

      {/* AR Canvas - only renders when session is active */}
      {isActive && (
        <div style={{ width: "100%", height: "100%" }}>
          <Canvas
            gl={{
              alpha: true,
              antialias: true,
              preserveDrawingBuffer: true,
              xrCompatible: true,
            }}
            camera={{ position: [0, 1.6, 0], near: 0.01, far: 100 }}
            style={{ touchAction: "none" }}
          >
            <ARSessionCanvas
              markers={markers}
              navigationPath={navigationPath}
              targetMarkerId={targetMarkerId}
              userPose={userPose}
              onMarkerSelect={onMarkerSelect}
              showDebug={showDebug}
            />
          </Canvas>
        </div>
      )}

      {/* 3D Preview fallback when AR not active */}
      {!isActive && state === "available" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "#f8fafc",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ textAlign: "center", padding: "20px" }}>
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>🗺️</div>
            <h3 style={{ margin: "0 0 8px", color: "#374151" }}>
              Förhandsvisning - 3D vy
            </h3>
            <p style={{ margin: "0 0 16px", color: "#6b7280", fontSize: "14px" }}>
              Klicka "Starta AR-navigation" ovan för att börja
            </p>
            <div style={{ color: "#9ca3af", fontSize: "12px" }}>
              {markers.length} markörer | {navigationPath?.waypoints.length || 0} waypoints
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ARNavigationView;