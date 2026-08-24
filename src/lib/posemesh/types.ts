/**
 * posemesh Web SDK TypeScript Types
 * Based on the posemesh Web SDK API (sdk/platform/Web/)
 * These types match the Emscripten-compiled JavaScript API
 */

// ============================================================================
// Core posemesh types
// ============================================================================

/** Vector3 for 3D positions */
export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

/** Quaternion for 3D rotations */
export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

/** 4x4 transformation matrix */
export type Matrix4 = number[]; // length 16, column-major

/** posemesh initialization status */
export type PosemeshStatus = "uninitialized" | "initializing" | "ready" | "error";

/** posemesh configuration */
export interface PosemeshConfig {
  /** Bootstrap peers for network discovery */
  bootstraps: string[];
  /** Relay server addresses */
  relays?: string[];
  /** Identity key (auto-generated if not provided) */
  key?: string;
  /** Display name */
  name?: string;
}

/** QR Code detection result */
export interface QRCode {
  /** Decoded QR content */
  data: string;
  /** Corner points in image coordinates */
  corners: Vector2[];
  /** Detection confidence (0-1) */
  confidence?: number;
}

/** Barcode detection result (EAN-13, EAN-8, UPC, Code128, etc.) */
export interface Barcode {
  /** Decoded barcode content (EAN, UPC, etc.) */
  data: string;
  /** Barcode format (ean_13, ean_8, upc_a, upc_e, code_128, etc.) */
  format: string;
  /** Corner points in image coordinates */
  corners: Vector2[];
  /** Detection confidence (0-1) */
  confidence?: number;
}

/** 2D point */
export interface Vector2 {
  x: number;
  y: number;
}

/** ArUco marker detection result */
export interface ArUcoMarker {
  /** ArUco marker ID */
  id: number;
  /** Corner points in image coordinates */
  corners: Vector2[];
  /** Marker size in meters (if known) */
  size?: number;
  /** Detection confidence (0-1) */
  confidence?: number;
}

/** 6DOF Pose estimation result */
export interface Pose {
  /** Position in 3D space (meters) */
  position: Vector3;
  /** Rotation as quaternion */
  rotation: Quaternion;
  /** Transformation matrix (4x4 column-major) */
  matrix: Matrix4;
  /** Pose confidence (0-1) */
  confidence: number;
  /** Timestamp of pose estimation */
  timestamp: number;
}

// ============================================================================
// Marker & Spatial types
// ============================================================================

/** Marker type */
export type MarkerType = "aruco" | "qr";

/** Marker metadata */
export interface MarkerMetadata {
  /** Shelf ID if marker is on a shelf */
  shelf_id?: string;
  /** Product IDs if marker is on a product */
  product_ids?: string[];
  /** Zone ID if marker defines a zone */
  zone_id?: string;
  /** Aisle ID if marker is in an aisle */
  aisle_id?: string;
  /** Entrance/exit ID */
  entrance_id?: string;
  exit_id?: string;
  /** Custom metadata */
  [key: string]: unknown;
}

/** Spatial marker in the database */
export interface SpatialMarker {
  id: string;
  map_id: string;
  marker_type: MarkerType;
  marker_id: string; // ArUco ID or QR content
  position: Vector3;
  rotation: Quaternion;
  metadata: MarkerMetadata;
  created_at: string;
}

/** Spatial map (collection of markers) */
export interface SpatialMap {
  id: string;
  store_id: string;
  name: string;
  version: number;
  origin_marker_id?: string;
  created_at: string;
  updated_at: string;
}

/** Shelf planogram with expected products */
export interface ShelfPlanogram {
  id: string;
  store_id: string;
  shelf_marker_id: string;
  name: string;
  expected_products: ExpectedProduct[];
  version: number;
  is_active: boolean;
  created_at: string;
}

/** Expected product on shelf */
export interface ExpectedProduct {
  product_id: string;
  ean: string;
  name: string;
  brand: string;
  size: string;
  position: {
    shelf_number: number;
    shelf_position: number;
    x_offset_inch: number;
    y_offset_inch: number;
    z_offset_inch: number;
  };
  facings: number;
  quantity_per_facing: number;
  total_quantity: number;
}

/** Shelf observation (real-time detection) */
export interface ShelfObservation {
  id: string;
  store_id: string;
  planogram_id: string;
  observed_products: ObservedProduct[];
  compliance_score: number;
  missing_products: string[];
  misplaced_products: MisplacedProduct[];
  extra_products: ObservedProduct[];
  captured_by: string;
  capture_method: "camera" | "manual" | "hybrid";
  device_info?: Record<string, unknown>;
  captured_at: string;
}

/** Observed product during shelf scan */
export interface ObservedProduct {
  product_id: string;
  ean: string;
  name?: string; // Optional name from detection
  position: Vector3;
  confidence: number;
  marker_id: string;
  facing_count?: number;
  /** Coop article number (BNR) if product was looked up in Coop sortiment */
  bnr?: string;
}

/** Misplaced product */
export interface MisplacedProduct {
  product_id: string;
  expected_position: Vector3;
  actual_position: Vector3;
  distance_meters: number;
}

/** Spatial task anchored to a marker */
export interface SpatialTask {
  id: string;
  store_id: string;
  anchor_marker_id: string;
  title: string;
  description: string;
  task_type: "restock" | "price_check" | "planogram_fix" | "cleanup" | "audit";
  priority: "low" | "medium" | "high" | "urgent";
  assigned_to?: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  due_at?: string;
  created_at: string;
  completed_at?: string;
}

/** Navigation route between markers */
export interface SpatialRoute {
  id: string;
  map_id: string;
  from_marker_id: string;
  to_marker_id: string;
  distance_meters: number;
  path: string[]; // Array of marker IDs
  created_at: string;
}

// ============================================================================
// Detection callbacks
// ============================================================================

export interface PosemeshDetectionCallbacks {
  onQRDetected?: (codes: QRCode[]) => void;
  onBarcodeDetected?: (codes: Barcode[]) => void;
  onArUcoDetected?: (markers: ArUcoMarker[]) => void;
  onPoseEstimated?: (pose: Pose) => void;
  onError?: (error: Error) => void;
}

export interface PosemeshDetectionOptions {
  facingMode: "environment" | "user";
  scanIntervalMs?: number;
  callbacks: PosemeshDetectionCallbacks;
}

// ============================================================================
// posemesh Module (Emscripten module interface)
// ============================================================================

export interface PosemeshModule {
  Posemesh: {
    initializePosemesh(): Promise<void>;
    getVersion(): string;
    getCommitId(): string;
    create(config: PosemeshConfig): PosemeshInstance;
  };
  QRDetection: {
    detectQRFromLuminance(luminance: Uint8Array, width: number, height: number): QRCode[];
  };
  ArucoDetection: {
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
  PoseEstimation: {
    solvePnP(
      objectPoints: number[],
      imagePoints: number[],
      cameraMatrix: number[],
      distCoeffs: number[],
    ): Pose | null;
  };
  Config: new () => PosemeshConfigInstance;
}

export interface PosemeshInstance {
  sendMessage(message: Uint8Array, peerId: string, protocol: string): void;
  sendString(string: string, appendNull: boolean, peerId: string, protocol: string): void;
}

export interface PosemeshConfigInstance {
  setBootstraps(bootstraps: string[]): void;
  setRelays(relays: string[]): void;
  setKey(key: string): void;
  setName(name: string): void;
}

// ============================================================================
// Global window extension
// ============================================================================

declare global {
  interface Window {
    posemeshModule?: PosemeshModule;
    initializePosemesh?: () => Promise<void>;
    Posemesh?: PosemeshModule["Posemesh"];
    QRDetection?: PosemeshModule["QRDetection"];
    ArucoDetection?: PosemeshModule["ArucoDetection"];
    PoseEstimation?: PosemeshModule["PoseEstimation"];
    Config?: PosemeshModule["Config"];
  }
}
