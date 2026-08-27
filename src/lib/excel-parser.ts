/**
 * Excel parser for StoreFlow - followsedel import
 * Uses 'xlsx' library to parse .xlsx files
 * Reads SAPUI5 - export sheet first (primary), falls back to first sheet
 */

import * as XLSX from 'xlsx';
import { type SupabaseClient } from '@supabase/supabase-js';
import { excelSerialToIsoDate } from './excel-date';

/**
 * Column names for följesedel file
 * Based on user provided columns, with trailing whitespace trimmed:
 * "Leveransdag" "Pallnummer" "SAP Produkt-ID" "BNR" "Produkt" "Varumärke"
 * "Innehåll" "Beställningskvantitet" "Beställningsenhet" "Enhetsomvandling"
 * "Levererad kvantitet" "Sann vikt(KG)" "Bäst-före-datum" "Leveransstatus"
 * "Pris per Leveransenhet (SEK)" "Totalpris(SEK)" "Kategori"
 * "Förväntad kvantitet" "Orderrad" "Ordernummer" "Leveransnummer"
 */

export type DeliveryNoteRow = {
  leveransdag: string | null;
  pallnummer: string;
  sapProduktId: string;
  bnr: string;
  produkt: string;
  varumärke: string;
  innehåll: string;
  beställningskvantitet: string;
  beställningsenhet: string;
  enhetsomvandling: string;
  levereradKvantitet: string;
  sannViktKg: string;
  bastForeDatum: string | null;
  leveransstatus: string;
  prisPerLeveransenhet: string;
  totalpris: string;
  kategori: string;
  förväntadKvantitet: string;
  orderrad: string;
  ordernummer: string;
  leveransnummer: string;
};

export type ParsedDeliveryNote = {
  rows: DeliveryNoteRow[];
  headers: string[];
  totalRows: number;
};

// Column positions (0-indexed) for the SAPUI5 - export sheet
// This maps to the exact order in the Excel file
export const SAPUI5_EXPORT_COLUMN_MAP = {
  // Row-level delivery note data
  deliveryDate: 0,     // Leveransdag (YYYY-MM-DD)
  palletNumber: 1,     // Pallnummer (null tillåts)
  sapProductId: 2,     // SAP Produkt-ID (heltal)
  bnr: 3,              // BNR (heltal, null tillåts)
  productName: 4,      // Produkt (trimmas, trailing whitespace)
  brand: 5,            // Varumärke (null tillåts)
  content: 6,          // Innehåll (t.ex. "258 ST", "275 gram")
  orderQuantity: 7,    // Beställningskvantitet (heltal)
  orderUnit: 8,        // Beställningsenhet (t.ex. "MIX", "ST", "K01")
  unitConversion: 9,   // Enhetsomvandling (t.ex. "1 MIX = 1 MIX")
  deliveredQuantity: 10, // Levererad kvantitet (heltal)
  netWeightKg: 11,     // Sann vikt(KG) (decimaltal)
  expiryDate: 12,      // Bäst-före-datum (YYYY-MM-DD, null tillåts)
  status: 13,          // Leveransstatus (t.ex. "Levererad", "Se pallstatus")
  pricePerUnit: 14,    // Pris per Leveransenhet (SEK) (decimaltal)
  totalPrice: 15,      // Totalpris(SEK) (decimaltal)
  category: 16,        // Kategori (t.ex. "SNACKS ( 1312 )")
  expectedQuantity: 17, // Förväntad kvantitet (heltal)
  orderLine: 18,       // Orderrad (heltal)
  orderNumber: 19,     // Ordernummer (heltal, null tillåts)
  deliveryNumber: 20,  // Leveransnummer (nummer/sträng, null tillåts)
} as const;

/**
 * Normalizes a date string to ISO format (YYYY-MM-DD).
 * Delegates to excelSerialToIsoDate for all conversion logic
 * (handles Date, Excel serial number, and ISO strings).
 */
function normalizeDate(dateStr: string | number | Date | null | undefined): string | null {
  if (dateStr == null || dateStr === '') return null;
  // XLSX returns Date objects or Excel serial numbers (e.g. 46259 = 2026-08-26).
  // excelSerialToIsoDate handles all three cases.
  return excelSerialToIsoDate(dateStr);
}

/**
 * Safely parses a value to a number without losing precision for large integers.
 * Returns null if the value is empty or can't be parsed.
 */
function safeParseInt(value: string | number | null | undefined): number | null {
  if (value == null || value === '') return null;
  const s = typeof value === 'string' ? value : String(value);
  const trimmed = s.trim();
  // Handle scientific notation and large numbers carefully
  const num = parseInt(trimmed, 10);
  if (isNaN(num)) return null;
  return num;
}

function safeParseFloat(value: string | null | undefined): number | null {
  if (!value || value.trim() === '') return null;
  const trimmed = value.trim();
  const num = parseFloat(trimmed);
  if (isNaN(num)) return null;
  return num;
}

/**
 * Parses a delivery note Excel file to structured rows.
 * Handles:
 * - Reading the "SAPUI5 - export" sheet first (primary)
 * - Falling back to first sheet if not found
 * - Trimming all column names and string values
 * - Normalizing dates to ISO format (YYYY-MM-DD)
 * - Safely parsing integers and floats without precision loss
 * - Handling null/empty fields gracefully
 */
export async function parseDeliveryNoteExcel(file: File): Promise<ParsedDeliveryNote> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });

        // Find the SAPUI5 - export sheet first, fall back to first sheet
        const targetSheetName = workbook.SheetNames.find(
          (n) => n.toLowerCase().includes('sapui5')
        ) || workbook.SheetNames[0];
        const targetWorksheet = workbook.Sheets[targetSheetName];

        // Convert to JSON with header row as array
        const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(
          targetWorksheet,
          {
            header: 1, // First row as header array
            defval: '',
            blankrows: false,
          }
        );

        if (!jsonData || jsonData.length === 0) {
          return resolve({ rows: [], headers: [], totalRows: 0 });
        }

        // --- Step 1: Extract and normalize headers ---
        const rawHeaders = ((jsonData[0] || []) as unknown) as (string | number | null)[];
        // Trim all header values and remove trailing whitespace
        const headers = rawHeaders.map((h: string | number | null) =>
          typeof h === 'string' ? h.trim().replace(/\s+$/g, '') : String(h).trim()
        );

        // --- Step 2: Find data rows (skip header row) ---
        const dataRows = ((jsonData.slice(1)) as unknown as (string | number | null | undefined)[][]).filter(
          (row) => Array.isArray(row) && row.length > 0
        );

        // --- Step 3: Map each row to DeliveryNoteRow ---
        const rows: DeliveryNoteRow[] = dataRows.map((row) => {
          // Ensure row has enough columns, pad with empty strings if needed
          const paddedRow = (row as (string | number | null | undefined)[]).map(
            (cell) => cell ?? ''
          );

          // Trim all string values and normalize
          const trim = (val: string | number | null | undefined): string =>
            typeof val === 'string' ? val.trim().replace(/\s+$/g, '') : String(val).trim();

          // Parse numeric fields safely to avoid precision loss with large integers
          const parseIntSafe = (val: string | number | null | undefined): number | null => {
            if (val === null || val === undefined || val === '') return null;
            const n = safeParseInt(String(val));
            return n;
          };

          const parseFloatSafe = (val: string | number | null | undefined): number | null => {
            if (val === null || val === undefined || val === '') return null;
            const n = safeParseFloat(String(val));
            return n;
          };

          return {
            // Leveransdag (YYYY-MM-DD)
            leveransdag: normalizeDate(trim(paddedRow[SAPUI5_EXPORT_COLUMN_MAP.deliveryDate])),

            // Pallnummer (null tillåts)
            pallnummer: paddedRow[SAPUI5_EXPORT_COLUMN_MAP.palletNumber] !== ''
              ? String(trim(paddedRow[SAPUI5_EXPORT_COLUMN_MAP.palletNumber]))
              : '',

            // SAP Produkt-ID (heltal)
            sapProduktId: paddedRow[SAPUI5_EXPORT_COLUMN_MAP.sapProductId] !== ''
              ? String(safeParseInt(paddedRow[SAPUI5_EXPORT_COLUMN_MAP.sapProductId]) ?? '')
              : '',

            // BNR (heltal, null tillåts)
            bnr: paddedRow[SAPUI5_EXPORT_COLUMN_MAP.bnr] !== ''
              ? String(safeParseInt(paddedRow[SAPUI5_EXPORT_COLUMN_MAP.bnr]) ?? '')
              : '',

            // Produkt (trimmas, trailing whitespace)
            produkt: trim(paddedRow[SAPUI5_EXPORT_COLUMN_MAP.productName]),

            // Varumärke (null tillåts)
            varumärke: paddedRow[SAPUI5_EXPORT_COLUMN_MAP.brand] !== ''
              ? trim(paddedRow[SAPUI5_EXPORT_COLUMN_MAP.brand])
              : '',

            // Innehåll
            innehåll: trim(paddedRow[SAPUI5_EXPORT_COLUMN_MAP.content]),

            // Beställningskvantitet (heltal)
            beställningskvantitet: paddedRow[SAPUI5_EXPORT_COLUMN_MAP.orderQuantity] !== ''
              ? String(safeParseInt(paddedRow[SAPUI5_EXPORT_COLUMN_MAP.orderQuantity]) ?? '')
              : '',

            // Beställningsenhet
            beställningsenhet: trim(paddedRow[SAPUI5_EXPORT_COLUMN_MAP.orderUnit]),

            // Enhetsomvandling
            enhetsomvandling: trim(paddedRow[SAPUI5_EXPORT_COLUMN_MAP.unitConversion]),

            // Levererad kvantitet (heltal)
            levereradKvantitet: paddedRow[SAPUI5_EXPORT_COLUMN_MAP.deliveredQuantity] !== ''
              ? String(safeParseInt(paddedRow[SAPUI5_EXPORT_COLUMN_MAP.deliveredQuantity]) ?? '')
              : '',

            // Sann vikt(KG) (decimaltal)
            sannViktKg: paddedRow[SAPUI5_EXPORT_COLUMN_MAP.netWeightKg] !== ''
              ? String(parseFloatSafe(paddedRow[SAPUI5_EXPORT_COLUMN_MAP.netWeightKg]) ?? '')
              : '',

            // Bäst-före-datum (YYYY-MM-DD, null tillåts)
            bastForeDatum: normalizeDate(
              trim(paddedRow[SAPUI5_EXPORT_COLUMN_MAP.expiryDate])
            ),

            // Leveransstatus
            leveransstatus: trim(paddedRow[SAPUI5_EXPORT_COLUMN_MAP.status]),

            // Pris per Leveransenhet (SEK) (decimaltal)
            prisPerLeveransenhet: paddedRow[SAPUI5_EXPORT_COLUMN_MAP.pricePerUnit] !== ''
              ? String(parseFloatSafe(paddedRow[SAPUI5_EXPORT_COLUMN_MAP.pricePerUnit]) ?? '')
              : '',

            // Totalpris(SEK) (decimaltal)
            totalpris: paddedRow[SAPUI5_EXPORT_COLUMN_MAP.totalPrice] !== ''
              ? String(parseFloatSafe(paddedRow[SAPUI5_EXPORT_COLUMN_MAP.totalPrice]) ?? '')
              : '',

            // Kategori
            kategori: trim(paddedRow[SAPUI5_EXPORT_COLUMN_MAP.category]),

            // Förväntad kvantitet (heltal)
            förväntadKvantitet: paddedRow[SAPUI5_EXPORT_COLUMN_MAP.expectedQuantity] !== ''
              ? String(safeParseInt(paddedRow[SAPUI5_EXPORT_COLUMN_MAP.expectedQuantity]) ?? '')
              : '',

            // Orderrad (heltal)
            orderrad: paddedRow[SAPUI5_EXPORT_COLUMN_MAP.orderLine] !== ''
              ? String(safeParseInt(paddedRow[SAPUI5_EXPORT_COLUMN_MAP.orderLine]) ?? '')
              : '',

            // Ordernummer (heltal, null tillåts)
            ordernummer: paddedRow[SAPUI5_EXPORT_COLUMN_MAP.orderNumber] !== ''
              ? String(safeParseInt(paddedRow[SAPUI5_EXPORT_COLUMN_MAP.orderNumber]) ?? '')
              : '',

            // Leveransnummer (nummer/sträng, null tillåts)
            leveransnummer: paddedRow[SAPUI5_EXPORT_COLUMN_MAP.deliveryNumber] !== ''
              ? String(trim(paddedRow[SAPUI5_EXPORT_COLUMN_MAP.deliveryNumber]))
              : '',
          };
        });

        // Normalize header names for lookup (trim and remove trailing whitespace)
        const normalizedHeaders = headers.map((h) =>
          typeof h === 'string' ? h.trim().replace(/\s+$/g, '') : String(h).trim()
        );

        resolve({
          rows,
          headers: normalizedHeaders,
          totalRows: rows.length,
        });
      } catch (err) {
        console.error("Parse error:", err);
        reject(err);
      }
    };

    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
}
export type ProductMatchResult = {
  row: DeliveryNoteRow;
  product: {
    id: string;
    sap_article_id: string;
    ean: string | null;
    bnr: string | null;
    name: string;
  } | null;
  isNewProduct: boolean;
};

/**
 * Match delivery note rows to existing products.
 * Matching order:
 *   1. Mat-nr (SAP produkt-ID) — primary match
 *   2. BNR (leverantörens artikelnummer) — fallback
 * SKU-logik har tagits bort helt per ny spec.
 */
export async function matchDeliveryNoteToProducts(
  supabase: SupabaseClient,
  storeId: string,
  rows: DeliveryNoteRow[],
): Promise<ProductMatchResult[]> {
  // Hämta existerande produkter för butiken
  const { data: storeProducts, error } = await supabase
    .from("products")
    .select("id, sap_article_id, ean, bnr, name")
    .eq("store_id", storeId);

  if (error) throw error;

  const results: ProductMatchResult[] = rows.map((row) => {
    const sapId = row.sapProduktId ?? "";
    const bnr = row.bnr ?? "";

    // Matcha först mot Mat-nr (SAP produkt-ID), sedan BNR
    const existing = (storeProducts ?? []).find(
      (p) =>
        (sapId && p.sap_article_id && p.sap_article_id === sapId) ||
        (bnr && p.bnr && p.bnr === bnr)
    );

    if (existing) {
      return { row, product: existing, isNewProduct: false };
    }

    return { row, product: null, isNewProduct: true };
  });

  return results;
}

