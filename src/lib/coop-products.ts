/**
 * Coop Product Lookup
 * Provides functions to look up products in "Mitt Coop sortiment" by EAN or BNR
 *
 * Uses centralized URL builders from @/lib/supabase for correct Mitt Coop URLs
 */

import { mittCoopSearchUrl } from "@/lib/supabase";

export interface CoopProduct {
  /** Product name */
  name: string;
  /** EAN barcode (13 or 8 digits) */
  ean?: string;
  /** Coop article number (BNR) */
  bnr?: string;
  /** Brand */
  brand?: string;
  /** Size/volume */
  size?: string;
  /** Category */
  category?: string;
  /** Price in SEK */
  price?: number;
  /** Image URL */
  imageUrl?: string;
  /** Product URL in Mitt Coop sortiment */
  productUrl?: string;
}

/**
 * Get Mitt Coop URL for a product by EAN
 * Uses the centralized mittCoopSearchUrl which builds correct URLs with siteId
 */
export function getMittCoopUrlForEan(ean: string, sapSiteId: string): string | null {
  return mittCoopSearchUrl(ean, sapSiteId);
}

/**
 * Get Mitt Coop URL for a product by BNR (article_number)
 * Uses the centralized mittCoopSearchUrl which builds correct URLs with siteId
 */
export function getMittCoopUrlForBnr(bnr: string, sapSiteId: string): string | null {
  return mittCoopSearchUrl(bnr, sapSiteId);
}

/**
 * Get Mitt Coop URL for a product (tries EAN first, then BNR)
 */
export function getMittCoopUrlForProduct(
  product: { ean?: string | null; bnr?: string | null },
  sapSiteId: string
): string | null {
  if (product.ean) {
    return mittCoopSearchUrl(product.ean, sapSiteId);
  }
  if (product.bnr) {
    return mittCoopSearchUrl(product.bnr, sapSiteId);
  }
  return null;
}

/**
 * Mock product database - in production this would come from Coop API
 * Contains common Swedish grocery products with EAN and BNR
 */
export const MOCK_COOP_PRODUCTS: CoopProduct[] = [
  // Coffee & Tea
  {
    ean: "7310663010014",
    bnr: "1001001",
    name: "Gevalia Mellanrost",
    brand: "Gevalia",
    size: "450g",
    category: "Kaffe",
    price: 89.9,
  },
  {
    ean: "7310663010021",
    bnr: "1001002",
    name: "Gevalia Mörkrost",
    brand: "Gevalia",
    size: "450g",
    category: "Kaffe",
    price: 89.9,
  },
  {
    ean: "7310663010038",
    bnr: "1001003",
    name: "Gevalia Bryggkaffe",
    brand: "Gevalia",
    size: "450g",
    category: "Kaffe",
    price: 79.9,
  },
  // Milk & Dairy
  {
    ean: "7310521003315",
    bnr: "2002001",
    name: "Arla Standard Mjölk 3%",
    brand: "Arla",
    size: "1L",
    category: "Mjölk",
    price: 16.9,
  },
  {
    ean: "7310521003322",
    bnr: "2002002",
    name: "Arla Lätt Mjölk 1.5%",
    brand: "Arla",
    size: "1L",
    category: "Mjölk",
    price: 15.9,
  },
  {
    ean: "7310521003339",
    bnr: "2002003",
    name: "Arla Skummjölk 0.5%",
    brand: "Arla",
    size: "1L",
    category: "Mjölk",
    price: 14.9,
  },
  // Bread
  {
    ean: "7310660001008",
    bnr: "3003001",
    name: "Pågen Hönökaka",
    brand: "Pågen",
    size: "260g",
    category: "Bröd",
    price: 24.9,
  },
  {
    ean: "7310660001015",
    bnr: "3003002",
    name: "Pågen Limpan",
    brand: "Pågen",
    size: "450g",
    category: "Bröd",
    price: 29.9,
  },
  // Snacks
  {
    ean: "7310662001006",
    bnr: "4004001",
    name: "OLW Cheez Doodles",
    brand: "OLW",
    size: "150g",
    category: "Snacks",
    price: 24.9,
  },
  {
    ean: "7310662001013",
    bnr: "4004002",
    name: "OLW Crunchips Sour Cream",
    brand: "OLW",
    size: "165g",
    category: "Snacks",
    price: 26.9,
  },
];

/**
 * Look up product by EAN in mock database
 */
export function lookupCoopProductByEan(ean: string): CoopProduct | undefined {
  return MOCK_COOP_PRODUCTS.find((p) => p.ean === ean);
}

/**
 * Look up product by BNR in mock database
 */
export function lookupCoopProductByBnr(bnr: string): CoopProduct | undefined {
  return MOCK_COOP_PRODUCTS.find((p) => p.bnr === bnr);
}

/**
 * Search products by name in mock database
 */
export function searchCoopProducts(query: string): CoopProduct[] {
  const lowerQuery = query.toLowerCase();
  return MOCK_COOP_PRODUCTS.filter(
    (p) =>
      p.name.toLowerCase().includes(lowerQuery) ||
      p.brand?.toLowerCase().includes(lowerQuery) ||
      p.category?.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Get product with Mitt Coop URL for a specific store
 */
export function getCoopProductWithUrl(
  product: CoopProduct,
  sapSiteId: string
): CoopProduct & { mittCoopUrl: string | null } {
  return {
    ...product,
    mittCoopUrl: getMittCoopUrlForProduct(product, sapSiteId),
  };
}

// Re-export the centralized URL builders for convenience
export { mittCoopSearchUrl } from "@/lib/supabase";