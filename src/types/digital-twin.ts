import type { Section2D } from "@/components/store-map-2d";

export type WizardStep = "portals" | "mapping" | "products" | "complete" | "qr";

export interface PlacedMarker {
  id: string; // spatial_markers.id (uuid)
  arucoId: number; // 0..49
  position: { x: number; y: number; z: number };
  sizeMeters?: number;
}

export interface ProductLink {
  ean: string;
  bnr?: string;
  name: string;
  markerId: string; // spatial_markers.id
  position: { x: number; y: number; z: number };
  facings: number;
  fromPlanogram: boolean;
}

export interface DigitalTwinSnapshot {
  spatialMapId: string | null;
  sections: Section2D[];
  markers: PlacedMarker[];
  productLinks: ProductLink[];
}

export interface PDFGenerationResult {
  success: boolean;
  markers: ArUcoMarkerData[];
  filename: string;
  blob: Blob;
}

export interface ArUcoMarkerData {
  id: number;
  data: string;
  position: { x: number; y: number };
  scale: number;
  rotation: number;
}
