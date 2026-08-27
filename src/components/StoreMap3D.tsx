/**
 * StoreMap3D - 3D Store Visualization Component
 * Renders spatial markers in 3D using React Three Fiber
 * Supports orbit controls (desktop) and touch controls (mobile)
 */

"use client";

import { useMemo, useRef, useCallback, useEffect, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  OrbitControls,
  Text,
  Html,
  Box,
  Cylinder,
  Plane,
  Torus,
  RoundedBox,
  Line,
} from "@react-three/drei";
import * as THREE from "three";
import "@/lib/three-patches"; // Ensure THREE.Clock available for R3F
import {
  StoreMap3DProps,
  Marker3DConfig,
  NavigationPath3D,
  MarkerType,
  MARKER_VISUAL_CONFIG,
  SELECTION_COLORS,
} from "@/lib/three-types";

// ============================================================================
// Marker Mesh Component
// ============================================================================

interface MarkerMeshProps {
  marker: Marker3DConfig;
  onClick: (marker: Marker3DConfig) => void;
  isSelected: boolean;
  isTarget: boolean;
  isUserPosition: boolean;
}

function MarkerMesh({
  marker,
  onClick,
  isSelected,
  isTarget,
  isUserPosition,
}: MarkerMeshProps) {
  const config = MARKER_VISUAL_CONFIG[marker.type];
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  // Determine color based on state
  const getColor = useCallback(() => {
    if (isUserPosition) return SELECTION_COLORS.userPosition;
    if (isTarget) return SELECTION_COLORS.target;
    if (isSelected || hovered) return SELECTION_COLORS.selected;
    return config.color;
  }, [config.color, isSelected, isTarget, isUserPosition, hovered]);

  const color = getColor();

  // Animation for selected/target markers
    useFrame((_, delta) => {
    if (meshRef.current && (isSelected || isTarget || isUserPosition)) {
      const pulse = 1 + Math.sin(performance.now() * 0.003) * 0.1;
      meshRef.current.scale.setScalar(pulse);
    } else if (meshRef.current) {
      meshRef.current.scale.setScalar(1);
    }
  });

  const handleClick = (event: any) => {
    event.stopPropagation();
    onClick(marker);
  };

  const handlePointerOver = () => setHovered(true);
  const handlePointerOut = () => setHovered(false);

  // Render appropriate geometry based on marker type
  const renderGeometry = () => {
    const [w, h, d] = config.size;
    const baseProps: any = {
      ref: meshRef,
      position: [marker.position.x, marker.position.y + h / 2, marker.position.z],
      rotation: marker.rotation ? [marker.rotation.x, marker.rotation.y, marker.rotation.z] : undefined,
      onClick: handleClick,
      onPointerOver: handlePointerOver,
      onPointerOut: handlePointerOut,
    };

    switch (config.geometry) {
      case "box":
        return (
          <Box {...baseProps} args={[w, h, d]}>
            <meshStandardMaterial color={color} opacity={config.opacity} transparent={config.opacity !== undefined && config.opacity < 1} />
          </Box>
        );
      case "cylinder":
        return (
          <Cylinder {...baseProps} args={[config.size[0], config.size[0], config.size[1], config.size[2]]}>
            <meshStandardMaterial color={color} opacity={config.opacity} transparent={config.opacity !== undefined && config.opacity < 1} />
          </Cylinder>
        );
      case "plane":
        return (
          <Plane {...baseProps} args={[config.size[0], config.size[2]]} rotation={[-Math.PI / 2, 0, 0]} position={[marker.position.x, marker.position.y + 0.01, marker.position.z]}>
            <meshStandardMaterial color={color} opacity={config.opacity} transparent={config.opacity !== undefined && config.opacity < 1} />
          </Plane>
        );
      case "torus":
        return (
          <Torus {...baseProps} args={[config.size[0], config.size[1], config.size[2], config.size[3]]} rotation={[-Math.PI / 2, 0, 0]} position={[marker.position.x, marker.position.y + 0.05, marker.position.z]}>
            <meshStandardMaterial color={color} opacity={config.opacity} transparent={config.opacity !== undefined && config.opacity < 1} />
          </Torus>
        );
      default:
        return (
          <RoundedBox {...baseProps} args={[w, h, d, 0.05]}>
            <meshStandardMaterial color={color} opacity={config.opacity} transparent={config.opacity !== undefined && config.opacity < 1} />
          </RoundedBox>
        );
    }
  };

  return (
    <group>
      {renderGeometry()}
      {/* Marker label */}
      <Html
        position={[marker.position.x, marker.position.y + config.size[1] + 0.3, marker.position.z]}
        wrapperClass="marker-label"
        style={{
          transform: "translate(-50%, -100%)",
          fontSize: "12px",
          fontWeight: 600,
          color: "#1f2937",
          background: "rgba(255,255,255,0.9)",
          padding: "2px 6px",
          borderRadius: "4px",
          whiteSpace: "nowrap",
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          pointerEvents: "none",
        }}
        distanceFactor={10}
        zIndexRange={[100, 200]}
      >
        {marker.name}
        {marker.type === "entrance" && " 🚪"}
        {marker.type === "exit" && " 🚪"}
        {marker.type === "shelf" && " 📦"}
        {marker.type === "product" && " 📦"}
      </Html>
    </group>
  );
}

// ============================================================================
// Navigation Path Component
// ============================================================================

interface NavigationPathMeshProps {
  path: NavigationPath3D;
}

function NavigationPathMesh({ path }: NavigationPathMeshProps) {
  const points = useMemo(
    () => path.waypoints.map((wp) => new THREE.Vector3(wp.x, wp.y + 0.1, wp.z)),
    [path.waypoints]
  );

  const lineRef = useRef<THREE.Line>(null);

  useFrame(() => {
    if (lineRef.current && "dashOffset" in (lineRef.current.material || {})) {
      const material = lineRef.current.material as any;
      material.dashOffset = material.dashOffset - 0.01;
    }
  });

  return (
    <Line
      ref={lineRef as any}
      points={points}
      color={path.color || SELECTION_COLORS.path}
      lineWidth={4}
      dashScale={1}
    />
  );
}

// ============================================================================
// Grid Floor Component
// ============================================================================

interface GridFloorProps {
  bounds?: { min: { x: number; z: number }; max: { x: number; z: number } };
  cellSize?: number;
}

function GridFloor({ bounds, cellSize = 1 }: GridFloorProps) {
  const gridRef = useRef<THREE.GridHelper>(null);

  useEffect(() => {
    if (gridRef.current && bounds) {
      const sizeX = bounds.max.x - bounds.min.x;
      const sizeZ = bounds.max.z - bounds.min.z;
      const size = Math.max(sizeX, sizeZ) + cellSize * 2;
      const centerX = (bounds.min.x + bounds.max.x) / 2;
      const centerZ = (bounds.min.z + bounds.max.z) / 2;

      gridRef.current.position.set(centerX, 0, centerZ);
      gridRef.current.scale.setScalar(size / 10); // GridHelper default is 10x10
    }
  }, [bounds, cellSize]);

  return (
    <gridHelper
      ref={gridRef}
      args={[10, 10, "#e5e7eb", "#d1d5db"]}
      position={[0, 0, 0]}
    />
  );
}

// ============================================================================
// Bounds Calculation Helper
// ============================================================================

function calculateBounds(markers: Marker3DConfig[]): { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } | null {
  if (markers.length === 0) return null;

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const marker of markers) {
    const config = MARKER_VISUAL_CONFIG[marker.type];
    const [w, h, d] = config.size;
    const halfW = w / 2, halfH = h / 2, halfD = d / 2;

    minX = Math.min(minX, marker.position.x - halfW);
    minY = Math.min(minY, marker.position.y);
    minZ = Math.min(minZ, marker.position.z - halfD);
    maxX = Math.max(maxX, marker.position.x + halfW);
    maxY = Math.max(maxY, marker.position.y + h);
    maxZ = Math.max(maxZ, marker.position.z + halfD);
  }

  // Add padding
  const padding = 2;
  return {
    min: { x: minX - padding, y: minY - padding, z: minZ - padding },
    max: { x: maxX + padding, y: maxY + padding, z: maxZ + padding },
  };
}

// ============================================================================
// Main StoreMap3D Component
// ============================================================================

export function StoreMap3D({
  markers,
  navigationPath,
  selectedMarkerId,
  onMarkerClick,
  onSetNavigationTarget,
  cameraPosition,
  cameraTarget,
  enableOrbitControls = true,
  enableTouchControls = true,
  showGrid = true,
  showAxes = false,
  backgroundColor = "#f8fafc",
  canvasStyle,
  className,
}: StoreMap3DProps) {
  const bounds = useMemo(() => calculateBounds(markers), [markers]);
  const center = useMemo(() => {
    if (!bounds) return { x: 0, y: 0, z: 0 };
    return {
      x: (bounds.min.x + bounds.max.x) / 2,
      y: (bounds.min.y + bounds.max.y) / 2,
      z: (bounds.min.z + bounds.max.z) / 2,
    };
  }, [bounds]);

  const initialCameraPosition = cameraPosition || { x: center.x, y: center.y + 8, z: center.z + 10 };
  const initialCameraTarget = cameraTarget || center;

  // Handle marker click - set as navigation target on double-click or long press
  const handleMarkerClick = useCallback(
    (marker: Marker3DConfig) => {
      onMarkerClick?.(marker);
      // Could add logic for double-click -> set navigation target
    },
    [onMarkerClick]
  );

  return (
    <div className={className} style={{ width: "100%", height: "100%", ...canvasStyle }}>
      <Canvas
        camera={{
          position: [initialCameraPosition.x, initialCameraPosition.y, initialCameraPosition.z],
          fov: 60,
          near: 0.1,
          far: 1000,
        }}
        gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
        style={{ touchAction: enableTouchControls ? "none" : "auto" }}
      >
        {/* Scene background */}
        <color attach="background" args={[backgroundColor]} />

        {/* Lighting */}
        <ambientLight {...{ intensity: 0.5, color: "#ffffff" }} />
        <directionalLight
          position={[5, 10, 7]}
          intensity={1.0}
          color="#ffffff"
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-near={0.1}
          shadow-camera-far={50}
          shadow-camera-left={-20}
          shadow-camera-right={20}
          shadow-camera-top={20}
          shadow-camera-bottom={-20}
        />
        <hemisphereLight args={["#87ceeb", "#8fbc8f", 0.6]} />

        {/* Grid floor */}
        {showGrid && bounds && <GridFloor bounds={{ min: { x: bounds.min.x, z: bounds.min.z }, max: { x: bounds.max.x, z: bounds.max.z } }} />}

        {/* Axes helper for debugging */}
        {showAxes && <axesHelper args={[5]} />}

        {/* Markers */}
        <group name="markers">
          {markers.map((marker) => (
            <MarkerMesh
              key={marker.id}
              marker={marker}
              onClick={handleMarkerClick}
              isSelected={marker.id === selectedMarkerId}
              isTarget={!!marker.isTarget}
              isUserPosition={!!marker.isUserPosition}
            />
          ))}
        </group>

        {/* Navigation path */}
        {navigationPath && navigationPath.waypoints.length > 1 && (
          <NavigationPathMesh path={navigationPath} />
        )}

        {/* Controls */}
        {enableOrbitControls && (
          <OrbitControls
            enablePan={true}
            enableZoom={true}
            enableRotate={true}
            enableDamping={true}
            dampingFactor={0.05}
            minDistance={2}
            maxDistance={100}
            maxPolarAngle={Math.PI / 2 - 0.05}
            target={initialCameraTarget as any}
          />
        )}
      </Canvas>
    </div>
  );
}

// ============================================================================
// Mobile-optimized wrapper
// ============================================================================

interface StoreMap3DMobileProps extends Omit<StoreMap3DProps, "map" | "selectedMarker" | "onMarkerSelect" | "show2D" | "show3D"> {
  /** Height of the 3D view (default: 400px) */
  height?: string | number;
}

export function StoreMap3DMobile({
  height = "400px",
  ...props
}: StoreMap3DMobileProps) {
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  return (
    <StoreMap3D
      {...props}
      enableOrbitControls={!isMobile}
      enableTouchControls={isMobile}
      canvasStyle={{ height, width: "100%", ...props.canvasStyle }}
    />
  );
}

export default StoreMap3D;