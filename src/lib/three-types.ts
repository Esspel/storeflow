import "@/lib/three-patches"; // Ensure THREE.Clock available for R3F
/**
 * Three.js / React Three Fiber Shared Types
 * Types for 3D store map, markers, and navigation
 */

import type { Vector3 as PosemeshVector3, Quaternion } from "@/lib/posemesh/types";
import * as THREE from "three";
import type { RouteResult } from "@/lib/route-optimizer";

// Re-export for convenience
export type Vector3 = PosemeshVector3;

/** Marker types from spatial_markers table */
export type MarkerType = "shelf" | "product" | "zone" | "entrance" | "exit" | "aisle";

/** 3D Marker configuration */
export interface Marker3DConfig {
  /** Unique marker ID from database */
  id: string;
  /** Display name */
  name: string;
  /** Marker type determines visual representation */
  type: MarkerType;
  /** World position in meters (from spatial_markers.position) */
  position: Vector3;
  /** World rotation as quaternion (from spatial_markers.rotation) */
  rotation?: Quaternion;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** Whether this marker is currently selected/highlighted */
  isSelected?: boolean;
  /** Whether this marker is the target for navigation */
  isTarget?: boolean;
  /** Whether this marker is the user's current position (AR) */
  isUserPosition?: boolean;
  /** Planogram compliance status (overrides color when set) */
  compliance?: "compliant" | "warning" | "nonCompliant";
}

/** Navigation path in 3D space */
export interface NavigationPath3D {
  /** Waypoints in world coordinates */
  waypoints: Vector3[];
  /** Total distance in meters */
  totalDistance: number;
  /** Estimated time in seconds */
  estimatedTimeSeconds: number;
  /** Color for the path line */
  color?: string;
}

/** StoreMap3D component props */
export interface StoreMap3DProps {
  /** Array of markers to display */
  markers: Marker3DConfig[];
  /** Optional navigation path to display */
  navigationPath?: NavigationPath3D;
  /** Currently selected marker ID */
  selectedMarkerId?: string;
  /** Callback when marker is clicked */
  onMarkerClick?: (marker: Marker3DConfig) => void;
  /** Callback when navigation target is set */
  onSetNavigationTarget?: (markerId: string) => void;
  /** Camera initial position */
  cameraPosition?: Vector3;
  /** Camera initial target */
  cameraTarget?: Vector3;
  /** Enable orbit controls (desktop) */
  enableOrbitControls?: boolean;
  /** Enable touch controls (mobile) */
  enableTouchControls?: boolean;
  /** Show grid floor */
  showGrid?: boolean;
  /** Show axes helper */
  showAxes?: boolean;
  /** Background color */
  backgroundColor?: string;
  /** Canvas style */
  canvasStyle?: React.CSSProperties;
  /** Class name for canvas container */
  className?: string;
}

/** AR Navigation View Props */
export interface ARNavigationViewProps {
  /** Markers in world space */
  markers: Marker3DConfig[];
  /** Current navigation path */
  navigationPath?: NavigationPath3D;
  /** Target marker ID being navigated to */
  targetMarkerId?: string;
  /** User's current pose (from WebXR or posemesh) */
  userPose?: { position: Vector3; rotation: Quaternion } | null;
  /** Callback when AR session starts */
  onSessionStart?: () => void;
  /** Callback when AR session ends */
  onSessionEnd?: () => void;
  /** Callback when user taps a marker in AR */
  onMarkerSelect?: (markerId: string) => void;
  /** Show debug info */
  showDebug?: boolean;
}

/** Marker visual configuration per type */
export const MARKER_VISUAL_CONFIG: Record<
  MarkerType,
  {
    geometry: "box" | "cylinder" | "plane" | "torus";
    size: [number, number, number] | [number, number, number, number]; // [width, height, depth] or [radius, tube, radialSegments, tubularSegments]
    color: string;
    emissive?: string;
    opacity?: number;
  }
> = {
  shelf: {
    geometry: "box",
    size: [0.8, 1.6, 0.4], // width, height, depth (meters)
    color: "#3eabf3", // Coop Blå 600
    emissive: "#1f76b0", // Coop Blå 800
    opacity: 0.9,
  },
  product: {
    geometry: "box",
    size: [0.15, 0.15, 0.15], // small cube
    color: "#299d3a", // Coop Grön 500
    emissive: "#1a5c2e", // Coop Grön 800
    opacity: 1.0,
  },
  zone: {
    geometry: "plane",
    size: [2.0, 0.01, 2.0], // large flat area marker
    color: "#FF934B", // Coop Orange 500
    emissive: "#C75102", // Coop Orange 800
    opacity: 0.5,
  },
  entrance: {
    geometry: "cylinder",
    size: [0.6, 0.3, 16], // radius, height, radialSegments
    color: "#008A14", // Coop Grön 600
    emissive: "#005E0E", // Coop Grön 800
    opacity: 0.9,
  },
  exit: {
    geometry: "cylinder",
    size: [0.6, 0.3, 16],
    color: "#D33636", // Coop Röd 500
    emissive: "#AB0000", // Coop Röd 700
    opacity: 0.9,
  },
  aisle: {
    geometry: "torus",
    size: [1.0, 0.05, 16, 32], // radius, tube, radialSegments, tubularSegments
    color: "#00416B", // Coop Blå 1000
    emissive: "#0C5C92", // Coop Blå 900
    opacity: 0.6,
  },
};

/** Selection highlight colors */
export const SELECTION_COLORS = {
  default: "#FBF8F4", // Coop Grå 100
  selected: "#FFF000", // Coop Gul 600
  target: "#299D3A", // Coop Grön 500
  userPosition: "#3EABF3", // Coop Blå 600
  path: "#FFF000", // Coop Gul 600 for navigation path
} as const;

/** Planogram compliance overlay colors */
export const COMPLIANCE_COLORS = {
  compliant: "#299D3A", // Coop Grön 500
  warning: "#FF934B", // Coop Orange 500
  nonCompliant: "#D33636", // Coop Röd 500
} as const;

/** Default camera settings */
export const DEFAULT_CAMERA_CONFIG = {
  position: { x: 0, y: 5, z: 10 } as Vector3,
  target: { x: 0, y: 0, z: 0 } as Vector3,
  fov: 60,
  near: 0.1,
  far: 1000,
} as const;

/** Lighting configuration */
export const LIGHTING_CONFIG = {
  ambient: { color: "#FBF8F4", intensity: 0.5 },
  directional: {
    color: "#FFFFFF",
    intensity: 1.0,
    position: { x: 5, y: 10, z: 7 } as Vector3,
  },
  hemisphere: { skyColor: "#DDF0FD", groundColor: "#CCE8D0", intensity: 0.6 },
} as const;
// Helper: konvertera posemesh Vector3 till THREE.Vector3 med metoder
export function toThreeVector3(v: Vector3): THREE.Vector3 {
  return new THREE.Vector3(v.x, v.y, v.z);
}
