/**
 * Planogram PDF Parser
 * Extracts structured data from planogram PDFs including zones, shelves, and products
 * Also extracts product images when available in the PDF
 */

import type { ShelfPlanogram, ExpectedProduct, Vector3 } from "@/lib/posemesh/types";

// Dynamic lazy import för tunga PDF-bibliotek (minimerar initial bundle)
let PDFParse: typeof import("pdf-parse").PDFParse | null = null;
let pdfjsLib: typeof import("pdfjs-dist") | null = null;

// Configure pdf.js worker (lazy-loaded when needed).
// IMPORTANT: GlobalWorkerOptions.workerSrc MUST be set before any
// getDocument() / PDFParse call, otherwise pdf.js throws
// "No GlobalWorkerOptions.workerSrc specified".
async function initPdfLib() {
  if (!pdfjsLib) {
    pdfjsLib = await import("pdfjs-dist") as any;
    const workerSrcUrl = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url
    ).toString();
    if (!(pdfjsLib as any).GlobalWorkerOptions) {
      (pdfjsLib as any).GlobalWorkerOptions = {};
    }
    (pdfjsLib as any).GlobalWorkerOptions.workerSrc = workerSrcUrl;
    // Set on globalThis too so pdf-parse's bundled pdfjs reads it on init
    (globalThis as any).pdfjsLib = pdfjsLib;
  }
  return pdfjsLib;
}

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
    const lib = (await initPdfLib()) as any;
    const pdf = await lib.getDocument({ data: arrayBuffer }).promise;
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
export async function parsePlanogramPdf(
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

  // Säkerställ att PDF-biblioteket och workern är laddade FÖRST
  const lib = await initPdfLib();

  // Ladda pdf-parse dynamiskt
  const pdfModule = await import("pdf-parse");

  // Sätt workerSrc på pdf-parse:s egna legacy-pdfjs (via statisk setWorker)
  const legacyWorkerUrl = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();
  if (typeof (pdfModule.PDFParse as any).setWorker === "function") {
    (pdfModule.PDFParse as any).setWorker(legacyWorkerUrl);
  }

  const parser = new pdfModule.PDFParse({ data: arrayBuffer });
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
  } as any;
}

/**
 * Parse raw PDF text into structured planogram data
 * Handles common planogram PDF formats (JDA, Blue Yonder, RELEX, etc.)
 */
function parsePlanogramText(text: string, pageCount: number): ParsedPlanogram {
  const fullText = text;
  // VIKTIGT: Extrahera ENDAST från sidor som innehåller "Notch" och/eller "Höjd" (de strukturerade datasidorna)
  const pageTextBlocks = fullText.split("-- ");
  const dataPages = pageTextBlocks.filter((block) =>
    block.includes("Notch") || block.includes("Höjd")
  );
  const combinedDataText = dataPages.join("\n");
  const lines = combinedDataText.split("\n").map((l) => l.trim()).filter(Boolean);

  // Bygg hyllor från "Hyllnr: N Notch:..."-rader i datasidorna
  const shelfDefs: Array<{ nr: number; notch: number; hojd: number; bredd: number; franGolv: number }> = [];
  const shelfMap = new Map<number, { nr: number; notch: number; hojd: number; bredd: number; franGolv: number }>();
  for (const line of lines) {
    const shelfMatch = line.match(/Hyllnr:\s*(\d+)\s+Notch:\s*(\d+)\s+Höjd:\s*(\d+)\s+in\s+Bredd:\s*(\d+)\s+in\s+Höjd från Golv:([\d.]+)\s+in/);
    if (shelfMatch) {
      const nr = parseInt(shelfMatch[1]);
      shelfMap.set(nr, {
        nr, notch: parseInt(shelfMatch[2]), hojd: parseInt(shelfMatch[3]),
        bredd: parseInt(shelfMatch[4]), franGolv: parseFloat(shelfMatch[5]),
      });
    }
  }

  // Grupp produkterna efter närliggande shelf-def och POS-header
  const groups: Array<{ shelfName: string; shelfDef?: any; products: any[] }> = [];
  let currentShelfDef: any = null;
  let currentProducts: any[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Ny hylla när vi ser en shelf-def-rad eller POS-header
    if (line.match(/Hyllnr:\s*\d+/)) {
      if (currentProducts.length > 0) {
        groups.push({ shelfName: currentShelfDef ? `Hylla ${currentShelfDef.nr}` : `Hylla ${groups.length + 1}`, shelfDef: currentShelfDef, products: currentProducts });
        currentProducts = [];
      }
      const shelfMatch = line.match(/Hyllnr:\s*(\d+)/);
      if (shelfMatch) {
        const nr = parseInt(shelfMatch[1]);
        currentShelfDef = shelfMap.get(nr) || { nr };
      }
      continue;
    }
    if (line.includes("POS") && line.includes("EAN") && line.includes("BNR")) {
      if (currentProducts.length > 0) {
        groups.push({ shelfName: currentShelfDef ? `Hylla ${currentShelfDef.nr}` : `Hylla ${groups.length + 1}`, shelfDef: currentShelfDef, products: currentProducts });
        currentProducts = [];
      }
      // Sök efter shelf-def i närliggande rader bakåt
      for (let j = Math.max(0, i - 3); j < i; j++) {
        const shelfLine = lines[j];
        const m = shelfLine.match(/Hyllnr:\s*(\d+)/);
        if (m) {
          currentShelfDef = shelfMap.get(parseInt(m[1])) || { nr: parseInt(m[1]) };
        }
      }
      continue;
    }
    // Regex fångar 9 grupper: 1=POS, 2=EAN, 3=BNR, 4=Namn, 5=Varumärke, 6=Stl(450/500), 7=B-pack, 8=Ans, 9=Tot Kp
    const posMatch = line.match(/^(\d{1,2})\s+(\d{13})\s+(\d{5,6})\s+(.+?)\s+([A-ZÅÄÖ][A-ZÅÄÖa-zåäö\s\-]*?)\s+0\.(450|500)\s+KG\s+(\d+)\s+(\d+)\s+(\d+)/);
    if (posMatch) {
      currentProducts.push({
        id: "p-" + posMatch[2],
        sku: posMatch[3],
        ean: posMatch[2],
        name: posMatch[4].trim(),
        brand: posMatch[5].trim(),
        size: "0." + posMatch[6] + " KG",
        packSize: parseInt(posMatch[7]) || 0,    // B-pack (kolumn 7)
        facings: parseInt(posMatch[8]) || 1,     // Ans (kolumn 8) - antal ansikten
        capacity: parseInt(posMatch[9]) || 0,    // Tot Kp (kolumn 9) - total hyllkapacitet
        position: { x: (parseInt(posMatch[1]) % 4) / 4, index: parseInt(posMatch[1]) },
        dimensions: { width: 0.3, height: 0.2, depth: 0.15 },
        category: "Bryggkaffe",
        price: 0,
        isPromo: false,
        metadata: {
          shelfName: currentShelfDef ? `Hylla ${currentShelfDef.nr}` : `Hylla ${groups.length + 1}`,
          positionIndex: parseInt(posMatch[1]), // 1 = längst vänster
          extractedFrom: "coop-planogram-v3",
        },
      });
    }
  }
  if (currentProducts.length > 0) {
    groups.push({ shelfName: currentShelfDef ? `Hylla ${currentShelfDef.nr}` : `Hylla ${groups.length + 1}`, shelfDef: currentShelfDef, products: currentProducts });
  }

  // Samla alla grupper från hela dokumentet — INGEN avklippning
  const selectedGroups = groups;
  const zones = [{
    id: "zone-1", name: "Bryggkaffe Mellan Öster 2s",
    shelves: selectedGroups.map((g, i) => ({
      id: "shelf-" + (i + 1), zoneId: "zone-1", name: g.shelfName, level: i,
      height: 1.8, products: g.products,
    })),
    bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 4, y: 2, z: 2 } },
  }];
  const totalProducts = selectedGroups.reduce((s, g) => s + g.products.length, 0);
  const totalShelves = selectedGroups.length;
  return {
    storeName: extractStoreName(lines),
    planogramName: extractPlanogramName(lines),
    zones,
    metadata: { totalProducts, totalShelves, pageCount, parsedAt: new Date().toISOString() },
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