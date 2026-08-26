/**
 * Excel parser for StoreFlow - followsedel import
 * Uses 'xlsx' library to parse .xlsx files
 */

import * as XLSX from 'xlsx';

/**
 * Column mapping for följesedel file
 * Based on user provided columns:
 * "Leveransdag    Pallnummer    SAP Produkt-ID    BNR    Produkt     Varumärke    Innehåll    Beställningskvantitet    Beställningsenhet    Enhetsomvandling    Levererad kvantitet    Sann vikt(KG)    Bäst-före-datum    Leveransstatus    Pris per Leveransenhet (SEK)    Totalpris(SEK)    Kategori    Förväntad kvantitet    Orderrad    Ordernummer    Leveransnummer"
 */
export interface DeliveryNoteRow {
  leveransdag: string;
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
  bastForeDatum: string;
  leveransstatus: string;
  prisPerLeveransenhet: string;
  totalpris: string;
  kategori: string;
  förväntadKvantitet: string;
  orderrad: string;
  ordernummer: string;
  leveransnummer: string;
}

export interface ParsedDeliveryNote {
  rows: DeliveryNoteRow[];
  headers: string[];
  totalRows: number;
}

/**
 * Parse Excel file to delivery note rows
 */
export async function parseDeliveryNoteExcel(file: File): Promise<ParsedDeliveryNote> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });

        // Get first sheet
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // Convert to JSON with header row
        const jsonData = XLSX.utils.sheet_to_json<DeliveryNoteRow>(worksheet, {
          header: 1, // First row as header
          defval: '',
          blankrows: false,
        });

        if (jsonData.length < 2) {
          resolve({ rows: [], headers: [], totalRows: 0 });
          return;
        }

        // First row is headers
        const headers = jsonData[0] as unknown as string[];

        // Map remaining rows to typed objects
        const rows: DeliveryNoteRow[] = [];
        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i] as unknown as string[];
          const mappedRow: DeliveryNoteRow = {
            leveransdag: row[0]?.toString() || '',
            pallnummer: row[1]?.toString() || '',
            sapProduktId: row[2]?.toString() || '',
            bnr: row[3]?.toString() || '',
            produkt: row[4]?.toString() || '',
            varumärke: row[5]?.toString() || '',
            innehåll: row[6]?.toString() || '',
            beställningskvantitet: row[7]?.toString() || '',
            beställningsenhet: row[8]?.toString() || '',
            enhetsomvandling: row[9]?.toString() || '',
            levereradKvantitet: row[10]?.toString() || '',
            sannViktKg: row[11]?.toString() || '',
            bastForeDatum: row[12]?.toString() || '',
            leveransstatus: row[13]?.toString() || '',
            prisPerLeveransenhet: row[14]?.toString() || '',
            totalpris: row[15]?.toString() || '',
            kategori: row[16]?.toString() || '',
            förväntadKvantitet: row[17]?.toString() || '',
            orderrad: row[18]?.toString() || '',
            ordernummer: row[19]?.toString() || '',
            leveransnummer: row[20]?.toString() || '',
          };
          rows.push(mappedRow);
        }

        resolve({
          rows,
          headers,
          totalRows: rows.length,
        });
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Match delivery note rows to existing products
 * Priority: sap_article_id (SAP Produkt-ID) -> bnr -> ean
 */
export interface ProductMatchResult {
  row: DeliveryNoteRow;
  product: {
    id: string;
    sap_article_id: string;
    ean: string | null;
    bnr: string | null;
    name: string;
    store_id: string;
  } | null;
  matchType: 'sap_article_id' | 'bnr' | 'ean' | 'none';
  isNewProduct: boolean;
}

export async function matchDeliveryNoteToProducts(
  supabase: any,
  storeId: string,
  rows: DeliveryNoteRow[]
): Promise<ProductMatchResult[]> {
  const results: ProductMatchResult[] = [];

  // Fetch all products for this store
  const { data: products } = await supabase
    .from('products')
    .select('id, sap_article_id, ean, bnr, name, store_id')
    .eq('store_id', storeId)
    .eq('is_active', true);

  const productBySap = new Map<string, typeof products[0]>();
  const productByBnr = new Map<string, typeof products[0]>();
  const productByEan = new Map<string, typeof products[0]>();

  products?.forEach((p: any) => {
    if (p.sap_article_id) productBySap.set(p.sap_article_id, p);
    if (p.bnr) productByBnr.set(p.bnr, p);
    if (p.ean) productByEan.set(p.ean, p);
  });

  for (const row of rows) {
    let matchedProduct = null;
    let matchType: ProductMatchResult['matchType'] = 'none';

    // Priority 1: SAP Produkt-ID (materialnummer)
    if (row.sapProduktId) {
      matchedProduct = productBySap.get(row.sapProduktId) || null;
      if (matchedProduct) matchType = 'sap_article_id';
    }

    // Priority 2: BNR
    if (!matchedProduct && row.bnr) {
      matchedProduct = productByBnr.get(row.bnr) || null;
      if (matchedProduct) matchType = 'bnr';
    }

    // Priority 3: EAN - would need EAN in delivery note, but we don't have it
    // Could be added if EAN column exists in the future

    results.push({
      row,
      product: matchedProduct,
      matchType,
      isNewProduct: !matchedProduct,
    });
  }

  return results;
}

/**
 * Create new products from unmatched delivery note rows
 */
export interface CreateProductInput {
  store_id: string;
  sap_article_id: string;
  bnr: string;
  name: string;
  brand: string;
  size: string;
  unit: string;
  category: string;
  ean?: string;
}

export async function createProductsFromDeliveryNote(
  supabase: any,
  userId: string,
  products: CreateProductInput[]
): Promise<{ created: any[]; errors: any[] }> {
  const created: any[] = [];
  const errors: any[] = [];

  for (const product of products) {
    try {
      // Check if product already exists (race condition protection)
      const { data: existing } = await supabase
        .from('products')
        .select('id')
        .eq('store_id', product.store_id)
        .eq('sap_article_id', product.sap_article_id)
        .maybeSingle();

      if (existing) {
        created.push(existing);
        continue;
      }

      const { data: newProduct, error } = await supabase
        .from('products')
        .insert({
          store_id: product.store_id,
          sap_article_id: product.sap_article_id,
          bnr: product.bnr,
          name: product.name,
          brand: product.brand,
          size: product.size,
          unit: product.unit,
          category: product.category,
          ean: product.ean || null,
          created_by: userId,
          updated_by: userId,
        })
        .select()
        .single();

      if (error) throw error;
      created.push(newProduct);
    } catch (error: unknown) {
      errors.push({ product, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return { created, errors };
}