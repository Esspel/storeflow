/**
 * Coop Product Lookup
 * Provides functions to look up products in "Mitt Coop sortiment" by EAN or BNR
 *
 * In a real implementation, this would connect to Coop's API or a local database.
 * For now, we provide mock implementations with a sample product database.
 */

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
 * Base URL for Mitt Coop sortiment product pages
 */
export const MITT_COOP_BASE_URL = "https://mittcoop.coop.se/sortiment";

/**
 * Generate a product URL for Mitt Coop sortiment
 * Uses BNR (article number) as the primary identifier
 */
export function generateMittCoopProductUrl(bnr: string): string {
  return `${MITT_COOP_BASE_URL}/${bnr}`;
}

/**
 * Generate a product URL for Mitt Coop sortiment using EAN
 * Fallback when BNR is not available
 */
export function generateMittCoopProductUrlFromEan(ean: string): string {
  return `${MITT_COOP_BASE_URL}/ean/${ean}`;
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
    productUrl: "https://mittcoop.coop.se/sortiment/1001001",
  },
  {
    ean: "7310663010021",
    bnr: "1001002",
    name: "Gevalia Mörkrost",
    brand: "Gevalia",
    size: "450g",
    category: "Kaffe",
    price: 89.9,
    productUrl: "https://mittcoop.coop.se/sortiment/1001002",
  },
  {
    ean: "7310663010038",
    bnr: "1001003",
    name: "Gevalia Bryggkaffe Klassiskt",
    brand: "Gevalia",
    size: "500g",
    category: "Kaffe",
    price: 99.9,
    productUrl: "https://mittcoop.coop.se/sortiment/1001003",
  },
  {
    ean: "7310663010045",
    bnr: "1001004",
    name: "Zoégas Skånerost",
    brand: "Zoégas",
    size: "450g",
    category: "Kaffe",
    price: 94.9,
    productUrl: "https://mittcoop.coop.se/sortiment/1001004",
  },
  {
    ean: "7310663010052",
    bnr: "1001005",
    name: "Zoégas Mellanrost",
    brand: "Zoégas",
    size: "450g",
    category: "Kaffe",
    price: 94.9,
    productUrl: "https://mittcoop.coop.se/sortiment/1001005",
  },
  {
    ean: "7310663010069",
    bnr: "1001006",
    name: "Löfbergs Lila Mellanrost",
    brand: "Löfbergs",
    size: "450g",
    category: "Kaffe",
    price: 84.9,
    productUrl: "https://mittcoop.coop.se/sortiment/1001006",
  },
  {
    ean: "7310663010076",
    bnr: "1001007",
    name: "Arvid Nordquist Mellanrost",
    brand: "Arvid Nordquist",
    size: "450g",
    category: "Kaffe",
    price: 79.9,
    productUrl: "https://mittcoop.coop.se/sortiment/1001007",
  },

  // Tea
  {
    ean: "7310663020013",
    bnr: "1002001",
    name: "Lipton Gul Te",
    brand: "Lipton",
    size: "20påsar",
    category: "Te",
    price: 34.9,
    productUrl: "https://mittcoop.coop.se/sortiment/1002001",
  },
  {
    ean: "7310663020020",
    bnr: "1002002",
    name: "Twinings Earl Grey",
    brand: "Twinings",
    size: "20påsar",
    category: "Te",
    price: 49.9,
    productUrl: "https://mittcoop.coop.se/sortiment/1002002",
  },
  {
    ean: "7310663020037",
    bnr: "1002003",
    name: "Rama Grön Te",
    brand: "Rama",
    size: "20påsar",
    category: "Te",
    price: 29.9,
    productUrl: "https://mittcoop.coop.se/sortiment/1002003",
  },

  // Breakfast
  {
    ean: "7310663030012",
    bnr: "1003001",
    name: "Axa Havregryn",
    brand: "Axa",
    size: "750g",
    category: "Frukost",
    price: 24.9,
    productUrl: "https://mittcoop.coop.se/sortiment/1003001",
  },
  {
    ean: "7310663030029",
    bnr: "1003002",
    name: "Kellogg's Cornflakes",
    brand: "Kellogg's",
    size: "500g",
    category: "Frukost",
    price: 39.9,
    productUrl: "https://mittcoop.coop.se/sortiment/1003002",
  },
  {
    ean: "7310663030036",
    bnr: "1003003",
    name: "Quaker Havregryn",
    brand: "Quaker",
    size: "1kg",
    category: "Frukost",
    price: 34.9,
    productUrl: "https://mittcoop.coop.se/sortiment/1003003",
  },
  {
    ean: "7310663030043",
    bnr: "1003004",
    name: "Crispy Müsli",
    brand: "Crispy",
    size: "600g",
    category: "Frukost",
    price: 44.9,
    productUrl: "https://mittcoop.coop.se/sortiment/1003004",
  },

  // Dairy
  {
    ean: "7310663040011",
    bnr: "1004001",
    name: "Arla Mjölk 3%",
    brand: "Arla",
    size: "1L",
    category: "Mejeri",
    price: 14.9,
    productUrl: "https://mittcoop.coop.se/sortiment/1004001",
  },
  {
    ean: "7310663040028",
    bnr: "1004002",
    name: "Arla Mjölk 1.5%",
    brand: "Arla",
    size: "1L",
    category: "Mejeri",
    price: 13.9,
    productUrl: "https://mittcoop.coop.se/sortiment/1004002",
  },
  {
    ean: "7310663040035",
    bnr: "1004003",
    name: "Arla Kefir Naturell",
    brand: "Arla",
    size: "1L",
    category: "Mejeri",
    price: 19.9,
    productUrl: "https://mittcoop.coop.se/sortiment/1004003",
  },
  {
    ean: "7310663040042",
    bnr: "1004004",
    name: "Valio Profeel Protein Yoghurt",
    brand: "Valio",
    size: "200g",
    category: "Mejeri",
    price: 18.9,
    productUrl: "https://mittcoop.coop.se/sortiment/1004004",
  },

  // Bread
  {
    ean: "7310663050010",
    bnr: "1005001",
    name: "Pågens Limpa",
    brand: "Pågens",
    size: "500g",
    category: "Bröd",
    price: 29.9,
    productUrl: "https://mittcoop.coop.se/sortiment/1005001",
  },
  {
    ean: "7310663050027",
    bnr: "1005002",
    name: "Hatting Kavring",
    brand: "Hatting",
    size: "500g",
    category: "Bröd",
    price: 24.9,
    productUrl: "https://mittcoop.coop.se/sortiment/1005002",
  },
  {
    ean: "7310663050034",
    bnr: "1005003",
    name: "Polarbröd Tunnbröd",
    brand: "Polarbröd",
    size: "250g",
    category: "Bröd",
    price: 19.9,
    productUrl: "https://mittcoop.coop.se/sortiment/1005003",
  },

  // Snacks
  {
    ean: "7310663060019",
    bnr: "1006001",
    name: "OLW Chips Naturell",
    brand: "OLW",
    size: "175g",
    category: "Snacks",
    price: 29.9,
    productUrl: "https://mittcoop.coop.se/sortiment/1006001",
  },
  {
    ean: "7310663060026",
    bnr: "1006002",
    name: "OLW Chips Sour Cream & Onion",
    brand: "OLW",
    size: "175g",
    category: "Snacks",
    price: 29.9,
    productUrl: "https://mittcoop.coop.se/sortiment/1006002",
  },
  {
    ean: "7310663060033",
    bnr: "1006003",
    name: "TUC Crackers Original",
    brand: "TUC",
    size: "150g",
    category: "Snacks",
    price: 19.9,
    productUrl: "https://mittcoop.coop.se/sortiment/1006003",
  },

  // Soft drinks
  {
    ean: "7310663070018",
    bnr: "1007001",
    name: "Coca-Cola Original",
    brand: "Coca-Cola",
    size: "1.5L",
    category: "Dryck",
    price: 22.9,
    productUrl: "https://mittcoop.coop.se/sortiment/1007001",
  },
  {
    ean: "7310663070025",
    bnr: "1007002",
    name: "Pepsi Max",
    brand: "Pepsi",
    size: "1.5L",
    category: "Dryck",
    price: 19.9,
    productUrl: "https://mittcoop.coop.se/sortiment/1007002",
  },
  {
    ean: "7310663070032",
    bnr: "1007003",
    name: "Spendrups Läsk Cola",
    brand: "Spendrups",
    size: "1.5L",
    category: "Dryck",
    price: 14.9,
    productUrl: "https://mittcoop.coop.se/sortiment/1007003",
  },
  {
    ean: "7310663070049",
    bnr: "1007004",
    name: "Loka Mineralvatten",
    brand: "Loka",
    size: "1.5L",
    category: "Dryck",
    price: 9.9,
    productUrl: "https://mittcoop.coop.se/sortiment/1007004",
  },

  // Household
  {
    ean: "7310663080017",
    bnr: "1008001",
    name: "Blenda Tvåldos",
    brand: "Blenda",
    size: "1.5L",
    category: "Hushåll",
    price: 59.9,
    productUrl: "https://mittcoop.coop.se/sortiment/1008001",
  },
  {
    ean: "7310663080024",
    bnr: "1008002",
    name: "Via Diskmaskinstab",
    brand: "Via",
    size: "30st",
    category: "Hushåll",
    price: 49.9,
    productUrl: "https://mittcoop.coop.se/sortiment/1008002",
  },
  {
    ean: "7310663080031",
    bnr: "1008003",
    name: "Zalo Diskmedel",
    brand: "Zalo",
    size: "500ml",
    category: "Hushåll",
    price: 24.9,
    productUrl: "https://mittcoop.coop.se/sortiment/1008003",
  },

  // Personal care
  {
    ean: "7310663090016",
    bnr: "1009001",
    name: "Dove Tvål Original",
    brand: "Dove",
    size: "4x100g",
    category: "Personlig vård",
    price: 49.9,
    productUrl: "https://mittcoop.coop.se/sortiment/1009001",
  },
  {
    ean: "7310663090023",
    bnr: "1009002",
    name: "Signal Tandkräm",
    brand: "Signal",
    size: "75ml",
    category: "Personlig vård",
    price: 19.9,
    productUrl: "https://mittcoop.coop.se/sortiment/1009002",
  },
  {
    ean: "7310663090030",
    bnr: "1009003",
    name: "Colgate Tandkräm Total",
    brand: "Colgate",
    size: "75ml",
    category: "Personlig vård",
    price: 24.9,
    productUrl: "https://mittcoop.coop.se/sortiment/1009003",
  },
];

/**
 * Look up a product by EAN barcode
 * @param ean - EAN-13 or EAN-8 barcode (13 or 8 digits)
 * @returns Product info or null if not found
 */
export async function lookupProductByEAN(
  ean: string,
): Promise<Pick<CoopProduct, "name" | "bnr"> | null> {
  // In production: call Coop API
  // const response = await fetch(`https://api.coop.se/products?ean=${ean}`, { headers: { Authorization: `Bearer ${token}` } });

  // Simulate API delay
  await new Promise((resolve) => setTimeout(resolve, 100));

  const product = MOCK_COOP_PRODUCTS.find((p) => p.ean === ean);
  return product ? { name: product.name, bnr: product.bnr } : null;
}

/**
 * Look up a product by BNR (Coop article number)
 * @param bnr - Coop article number (typically 6-7 digits)
 * @returns Product info or null if not found
 */
export async function lookupProductByBNR(
  bnr: string,
): Promise<Pick<CoopProduct, "name" | "bnr"> | null> {
  // In production: call Coop API
  // const response = await fetch(`https://api.coop.se/products?bnr=${bnr}`, { headers: { Authorization: `Bearer ${token}` } });

  // Simulate API delay
  await new Promise((resolve) => setTimeout(resolve, 100));

  const product = MOCK_COOP_PRODUCTS.find((p) => p.bnr === bnr);
  return product ? { name: product.name, bnr: product.bnr } : null;
}

/**
 * Search products by name (for autocomplete/search)
 * @param query - Search query
 * @returns Array of matching products
 */
export async function searchCoopProducts(query: string): Promise<CoopProduct[]> {
  await new Promise((resolve) => setTimeout(resolve, 100));

  const lowerQuery = query.toLowerCase();
  return MOCK_COOP_PRODUCTS.filter(
    (p) =>
      p.name.toLowerCase().includes(lowerQuery) ||
      p.brand?.toLowerCase().includes(lowerQuery) ||
      p.category?.toLowerCase().includes(lowerQuery) ||
      p.ean?.includes(query) ||
      p.bnr?.includes(query),
  );
}

/**
 * Get all products in a category
 */
export async function getCoopProductsByCategory(category: string): Promise<CoopProduct[]> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  return MOCK_COOP_PRODUCTS.filter((p) => p.category === category);
}

/**
 * Get all available categories
 */
export async function getCoopCategories(): Promise<string[]> {
  const categories = new Set(MOCK_COOP_PRODUCTS.map((p) => p.category).filter((c): c is string => Boolean(c)));
  return Array.from(categories).sort();
}
