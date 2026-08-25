/**
 * Planogram PDF Parser
 * Extracts structured data from planogram PDFs including zones, shelves, and products
 */

import { PDFParse } from "pdf-parse";
import type { ShelfPlanogram, ExpectedProduct, Vector3 } from "@/lib/posemesh/types";

export interface ParsedPlanogram {
  storeName?: string;
  planogramName?: string;
  zones: ParsedZone[];
  metadata: {
    totalProducts: number;
    totalShelves: number;
    pageCount: number;
    parsedAt: string;
  };
}

export interface ParsedZone {
  id: string;
  name: string;
  shelves: ParsedShelf[];
  bounds?: {
    min: Vector3;
    max: Vector3;
  };
}

export interface ParsedShelf {
  id: string;
  zoneId: string;
  name: string;
  level: number; // 0 = bottom, incrementing upward
  height: number; // in meters
  products: ParsedProduct[];
  position?: Vector3; // center position in 3D space
  dimensions?: {
    width: number;
    depth: number;
    height: number;
  };
}

export interface ParsedProduct {
  id: string;
  sku: string;
  ean?: string;
  name: string;
  facings: number;
  position: {
    x: number; // horizontal position on shelf (0-1)
    index: number; // discrete position index
  };
  dimensions?: {
    width: number;
    height: number;
    depth: number;
  };
  category?: string;
  brand?: string;
  price?: number;
  isPromo?: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Parse planogram PDF and extract structured data
 */
export async function parsePlanogramPdf(
  file: File | Buffer | ArrayBuffer
): Promise<ParsedPlanogram> {
  let buffer: Buffer;

  if (file instanceof File) {
    const arrayBuffer = await file.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
  } else if (file instanceof ArrayBuffer) {
    buffer = Buffer.from(file);
  } else {
    buffer = file;
  }

  const parser = new PDFParse({ data: buffer });
  const pdfData = await parser.getText();
  const text = pdfData.text;
  const pageCount = pdfData.total;

  // Parse the extracted text into structured data
  const parsed = parsePlanogramText(text, pageCount);

  return parsed;
}

/**
 * Parse raw PDF text into structured planogram data
 * Handles common planogram PDF formats (JDA, Blue Yonder, RELEX, etc.)
 */
function parsePlanogramText(text: string, pageCount: number): ParsedPlanogram {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // Try to detect store/planogram name from first pages
  const storeName = extractStoreName(lines);
  const planogramName = extractPlanogramName(lines);

  // Parse zones and shelves
  const zones = parseZones(lines);

  // Calculate totals
  let totalProducts = 0;
  let totalShelves = 0;
  for (const zone of zones) {
    totalShelves += zone.shelves.length;
    for (const shelf of zone.shelves) {
      totalProducts += shelf.products.length;
    }
  }

  return {
    storeName,
    planogramName,
    zones,
    metadata: {
      totalProducts,
      totalShelves,
      pageCount,
      parsedAt: new Date().toISOString(),
    },
  };
}

/**
 * Extract store name from PDF text
 */
function extractStoreName(lines: string[]): string | undefined {
  // Common patterns in planogram PDFs
  const patterns = [
    /^(?:Store|Butik|Shop)[:\s]+(.+)$/i,
    /^(?:Location|Plats)[:\s]+(.+)$/i,
  ];

  for (const line of lines.slice(0, 20)) {
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) return match[1].trim();
    }
  }
  return undefined;
}

/**
 * Extract planogram name from PDF text
 */
function extractPlanogramName(lines: string[]): string | undefined {
  const patterns = [
    /^(?:Planogram|Planogram namn|Planogram Name)[:\s]+(.+)$/i,
    /^(?:Category|Kategori)[:\s]+(.+)$/i,
    /^(?:Section|Sektion)[:\s]+(.+)$/i,
  ];

  for (const line of lines.slice(0, 30)) {
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) return match[1].trim();
    }
  }
  return undefined;
}

/**
 * Parse zones from PDF text
 * Handles various formats by looking for zone/shelf/product patterns
 */
function parseZones(lines: string[]): ParsedZone[] {
  const zones: ParsedZone[] = [];
  let currentZone: ParsedZone | null = null;
  let currentShelf: ParsedShelf | null = null;

  // Regex patterns for different planogram formats
  const zonePattern = /^(?:Zone|Zon|Area|Område|Section|Sektion)[\s:]+(.+)$/i;
  const shelfPattern = /^(?:Shelf|Hylla|Level|Nivå)[\s:]+(.+)$/i;
  const productPattern = /^(\d{8,14})\s+(.+?)\s+(\d+)\s*facings?/i; // EAN + name + facings
  const productPattern2 = /^(\w+)\s+(\d{8,14})\s+(.+?)\s+(\d+)\s*facings?/i; // SKU + EAN + name + facings
  const productPattern3 = /^(\d+)\s+(\d{8,14})\s+(.+?)\s+(\d+)/; // index + EAN + name + facings

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Zone detection
    const zoneMatch = line.match(zonePattern);
    if (zoneMatch) {
      // Save previous zone
      if (currentZone) zones.push(currentZone);

      currentZone = {
        id: `zone_${zones.length + 1}`,
        name: zoneMatch[1].trim(),
        shelves: [],
      };
      currentShelf = null;
      continue;
    }

    // Shelf detection
    const shelfMatch = line.match(shelfPattern);
    if (shelfMatch && currentZone) {
      if (currentShelf) currentZone.shelves.push(currentShelf);

      const shelfName = shelfMatch[1].trim();
      const level = parseInt(shelfName.match(/\d+/)?.[0] ?? "0", 10);

      currentShelf = {
        id: `${currentZone.id}_shelf_${currentZone.shelves.length + 1}`,
        zoneId: currentZone.id,
        name: shelfName,
        level,
        height: 0.3, // default 30cm shelf height
        products: [],
      };
      continue;
    }

    // Product detection - try multiple patterns
    if (currentShelf) {
      let product: ParsedProduct | null = null;

      // Pattern 1: EAN + name + facings
      let match = line.match(productPattern);
      if (match) {
        product = {
          id: `prod_${currentShelf.products.length + 1}`,
          ean: match[1],
          sku: match[1],
          name: match[2].trim(),
          facings: parseInt(match[3], 10),
          position: { x: 0, index: currentShelf.products.length },
        };
      } else {
        // Pattern 2: SKU + EAN + name + facings
        match = line.match(productPattern2);
        if (match) {
          product = {
            id: `prod_${currentShelf.products.length + 1}`,
            sku: match[1],
            ean: match[2],
            name: match[3].trim(),
            facings: parseInt(match[4], 10),
            position: { x: 0, index: currentShelf.products.length },
          };
        } else {
          // Pattern 3: index + EAN + name + facings
          match = line.match(productPattern3);
          if (match) {
            product = {
              id: `prod_${currentShelf.products.length + 1}`,
              ean: match[2],
              sku: match[2],
              name: match[3].trim(),
              facings: parseInt(match[4], 10),
              position: { x: 0, index: parseInt(match[1], 10) - 1 },
            };
          }
        }
      }

      if (product) {
        currentShelf.products.push(product);
      }
    }
  }

  // Save last zone/shelf
  if (currentShelf && currentZone) {
    currentZone.shelves.push(currentShelf);
  }
  if (currentZone) {
    zones.push(currentZone);
  }

  // If no zones found, create a default one from all products
  if (zones.length === 0) {
    return [createDefaultZone(lines)];
  }

  return zones;
}

/**
 * Create a default zone when no explicit zones found
 */
function createDefaultZone(lines: string[]): ParsedZone {
  const products: ParsedProduct[] = [];
  const productPattern = /(\d{8,14})\s+(.+?)\s+(\d+)\s*facings?/i;

  for (const line of lines) {
    const match = line.match(productPattern);
    if (match) {
      products.push({
        id: `prod_${products.length + 1}`,
        ean: match[1],
        sku: match[1],
        name: match[2].trim(),
        facings: parseInt(match[3], 10),
        position: { x: 0, index: products.length },
      });
    }
  }

  const shelf: ParsedShelf = {
    id: "default_shelf_1",
    zoneId: "default_zone",
    name: "Default Shelf",
    level: 0,
    height: 0.3,
    products,
  };

  return {
    id: "default_zone",
    name: "Default Zone",
    shelves: products.length > 0 ? [shelf] : [],
  };
}

/**
 * Convert parsed planogram to ShelfPlanogram format for compliance engine
 */
export function parsedToShelfPlanogram(parsed: ParsedPlanogram): ShelfPlanogram {
  const expectedProducts = parsed.zones.flatMap((zone, zoneIndex) =>
    zone.shelves.flatMap((shelf, shelfIndex) =>
      shelf.products.map((p) => ({
        product_id: p.id,
        ean: p.ean ?? p.sku,
        name: p.name,
        brand: p.brand ?? "",
        size: "",
        position: {
          shelf_number: shelf.level,
          shelf_position: p.position.index,
          x_offset_inch: p.position.index * 3.937, // ~10cm in inches
          y_offset_inch: 0,
          z_offset_inch: shelf.level * 11.811, // ~30cm in inches
        },
        facings: p.facings,
        quantity_per_facing: 1,
        total_quantity: p.facings,
      }))
    )
  );

  return {
    id: `planogram_${Date.now()}`,
    store_id: "", // to be set by caller
    shelf_marker_id: "",
    name: parsed.planogramName ?? "Imported Planogram",
    expected_products: expectedProducts,
    version: 1,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/**
 * Match parsed products with store product database
 * Returns matched products with internal product IDs
 */
export async function matchProductsWithDatabase(
  parsed: ParsedPlanogram,
  storeProducts: Array<{ id: string; ean: string; sku: string; name: string }>
): Promise<ParsedPlanogram> {
  // Create lookup maps
  const byEan = new Map(storeProducts.map((p) => [p.ean, p]));
  const bySku = new Map(storeProducts.map((p) => [p.sku, p]));
  const byName = new Map(storeProducts.map((p) => [p.name.toLowerCase(), p]));

  for (const zone of parsed.zones) {
    for (const shelf of zone.shelves) {
      for (const product of shelf.products) {
        let matched = byEan.get(product.ean ?? "");
        if (!matched) matched = bySku.get(product.sku);
        if (!matched) matched = byName.get(product.name.toLowerCase());

        if (matched) {
          product.id = matched.id;
          product.sku = matched.sku;
          product.ean = matched.ean;
          product.name = matched.name;
        }
      }
    }
  }

  return parsed;
}

/**
 * Generate zone markers from parsed planogram for QR/ArUco placement
 */
export function generateZoneMarkers(parsed: ParsedPlanogram): Array<{
  zoneId: string;
  zoneName: string;
  markerType: "qr" | "aruco";
  suggestedPosition: Vector3;
  metadata: {
    shelfCount: number;
    productCount: number;
  };
}> {
  return parsed.zones.map((zone, index) => ({
    zoneId: zone.id,
    zoneName: zone.name,
    markerType: index === 0 ? "qr" : "aruco", // First zone gets QR, rest ArUco
    suggestedPosition: {
      x: index * 2, // 2m apart
      y: 0,
      z: 1.5, // eye level
    },
    metadata: {
      shelfCount: zone.shelves.length,
      productCount: zone.shelves.reduce((sum, s) => sum + s.products.length, 0),
    },
  }));
}