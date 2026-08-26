/**
 * Planogram PDF Parser
 * Extracts structured data from planogram PDFs including zones, shelves, and products
 * Also extracts product images when available in the PDF
 */

import { PDFParse } from "pdf-parse";
import * as pdfjsLib from "pdfjs-dist";
import type { ShelfPlanogram, ExpectedProduct, Vector3 } from "@/lib/posemesh/types";

// Configure pdf.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

/**
 * Extract product images from PDF pages.
 * Matches product names from text with images in the same regions.
 * Returns a map of product name -> data URL of the image.
 */
export async function extractProductImagesFromPdf(
  file: File | ArrayBuffer,
  productNames: string[]
): Promise<Record<string, string | null>> {
  const arrayBuffer = file instanceof File ? await file.arrayBuffer() : file;

  try {
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const images: Record<string, string | null> = {};

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2 });

      // Get text content to find product names and their positions
      const textContent = await page.getTextContent();
      const textItems: { str: string; x: number; y: number }[] = [];

      for (const item of textContent.items) {
        const str = (item as any).str || "";
        if (str.trim()) {
          textItems.push({
            str,
            x: (item as any).x,
            y: (item as any).y,
          });
        }
      }

      // For each product name, check if any text item matches
      for (const productName of productNames) {
        if (images[productName]) continue; // Already found

        const lowerName = productName.toLowerCase();
        for (const textItem of textItems) {
          if (textItem.str.toLowerCase().includes(lowerName)) {
            // Try to render the page and capture a region around the text
            // as a best-effort image extraction
            try {
              const canvas = document.createElement("canvas");
              const ctx = canvas.getContext("2d");
              if (!ctx) continue;

              canvas.height = viewport.height;
              canvas.width = viewport.width;

              await page.render({
                canvasContext: ctx,
                viewport,
              }).promise;

              // Extract a small region around the matching text
              // This is a simplified approach - in practice you'd want
              // proper text position tracking and cropping
              const dataUrl = canvas.toDataURL("image/png");
              if (!images[productName]) {
                images[productName] = dataUrl;
              }
            } catch (renderError) {
              // Ignore rendering errors, continue to next product
            }
            break; // Found this product on this page
          }
        }
      }
    }

    // Set null for any products not found
    for (const productName of productNames) {
      if (!images[productName]) {
        images[productName] = null;
      }
    }

    return images;
  } catch (error) {
    console.error("Failed to extract product images from PDF:", error);
    // Return null for all products if PDF processing fails
    const nullResult: Record<string, string | null> = {};
    for (const name of productNames) {
      nullResult[name] = null;
    }
    return nullResult;
  }
}

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
  /** URL till produktbild från planogram (om tillgänglig) */
  imageUrl?: string;
}

/**
 * Parse planogram PDF and extract structured data WITH images
 */
export async function parsePlanogramPdfWithImages(
  file: File | ArrayBuffer
): Promise<ParsedPlanogram> {
  let arrayBuffer: ArrayBuffer;

  if (file instanceof File) {
    arrayBuffer = await file.arrayBuffer();
  } else if (file instanceof ArrayBuffer) {
    arrayBuffer = file;
  } else {
    throw new Error("Invalid file type: expected File or ArrayBuffer");
  }

  const parser = new PDFParse({ data: arrayBuffer });
  const pdfData = await parser.getText();
  const text = pdfData.text;
  const pageCount = pdfData.total;

  // Parse the extracted text into structured data (zones, shelves, products)
  const parsed = parsePlanogramText(text, pageCount);

  // Extract product images from the PDF based on product names
  const productNames = parsed.zones.flatMap(
    (zone) => zone.shelves.flatMap((shelf) => shelf.products).map((p) => p.name)
  );
  const images = await extractProductImagesFromPdf(file, productNames);

  // Attach image URLs to parsed products
  // We need to map back from the parsed products to add image URLs
  // This is a simplified approach - in a full implementation you'd track
  // product IDs through the parsing pipeline
  const updatedZones = parsed.zones.map((zone) =>
    zone.shelves.map((shelf) =>
      shelf.products.map((product) => ({
        ...product,
        imageUrl: images[product.name] ?? undefined,
      }))
    )
  );

  return {
    ...parsed,
    zones: updatedZones,
  };
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

  // If no zones found, return empty zones (no default zone/shelf)
  return zones;
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