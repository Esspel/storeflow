/**
 * Product Location Library
 * Maps products (EAN/BNR) to spatial markers for navigation
 * Uses product_locations table with store-scoped access
 */

import { supabase } from "@/lib/supabase";
import { mittCoopSearchUrl } from "@/lib/supabase";
import type { Vector3 } from "@/lib/posemesh/types";

// ============================================================================
// Types
// ============================================================================

export interface ProductLocation {
  id: string;
  store_id: string;
  product_id: string;
  marker_id: string;
  shelf_position: {
    shelf_number: number;
    position_index: number;
    x_offset: number;
    y_offset: number;
  } | null;
  facings: number;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
  // Joined relations
  product?: {
    id: string;
    name: string;
    ean: string | null;
    article_number: string | null; // BNR
    brand: string | null;
    image_url: string | null;
  } | null;
  marker?: {
    id: string;
    name: string;
    marker_type: string;
    map_id: string;
    position_x: number;
    position_y: number;
    position_z: number | null;
  } | null;
}

export interface CreateProductLocationInput {
  store_id: string;
  product_id: string;
  marker_id: string;
  shelf_position?: ProductLocation["shelf_position"];
  facings?: number;
  is_primary?: boolean;
}

export interface UpdateProductLocationInput {
  shelf_position?: ProductLocation["shelf_position"];
  facings?: number;
  is_primary?: boolean;
}

export interface ProductNavigationResult {
  product: ProductLocation["product"];
  primary_location: ProductLocation | null;
  alternative_locations: ProductLocation[];
  navigation_url: string | null;
  mitt_coop_url: string | null;
}

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Get all product locations for a store
 */
export async function getProductLocations(
  storeId: string,
  options?: {
    product_id?: string;
    marker_id?: string;
    is_primary?: boolean;
    limit?: number;
  },
): Promise<ProductLocation[]> {
  let query = supabase
    .from("product_locations")
    .select(
      `
      *,
      product:products!product_id(id, name, ean, article_number, brand, image_url),
      marker:spatial_markers!marker_id(id, name, marker_type, map_id, position_x, position_y, position_z)
    `,
    )
    .eq("store_id", storeId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: false });

  if (options?.product_id) {
    query = query.eq("product_id", options.product_id);
  }
  if (options?.marker_id) {
    query = query.eq("marker_id", options.marker_id);
  }
  if (options?.is_primary !== undefined) {
    query = query.eq("is_primary", options.is_primary);
  }
  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Failed to fetch product locations:", error);
    return [];
  }

  return (data ?? []) as ProductLocation[];
}

/**
 * Get product location by product ID (for navigation)
 */
export async function getProductLocationByProduct(
  storeId: string,
  productId: string,
): Promise<ProductNavigationResult | null> {
  const locations = await getProductLocations(storeId, {
    product_id: productId,
    limit: 10,
  });

  if (locations.length === 0) {
    return null;
  }

  const primary = locations.find((l) => l.is_primary) ?? locations[0];
  const alternatives = locations.filter((l) => l.id !== primary.id);

  // Get store's SAP site ID for Mitt Coop URLs
  const { data: store } = await supabase
    .from("stores")
    .select("sap_site_id")
    .eq("id", storeId)
    .single();

  const sapSiteId = store?.sap_site_id ?? null;

  return {
    product: primary.product ?? null,
    primary_location: primary,
    alternative_locations: alternatives,
    navigation_url: primary.marker
      ? `/spatial-navigation?marker=${primary.marker_id}&product=${productId}`
      : null,
    mitt_coop_url:
      primary.product?.ean && sapSiteId
        ? mittCoopSearchUrl(primary.product.ean, sapSiteId)
        : primary.product?.article_number && sapSiteId
          ? mittCoopSearchUrl(primary.product.article_number, sapSiteId)
          : null,
  };
}

/**
 * Get product location by EAN (for customer navigation)
 */
export async function getProductLocationByEan(
  storeId: string,
  ean: string,
): Promise<ProductNavigationResult | null> {
  // First find product by EAN
  const { data: product } = await supabase
    .from("products")
    .select("id")
    .eq("store_id", storeId)
    .eq("ean", ean)
    .single();

  if (!product) return null;

  return getProductLocationByProduct(storeId, product.id);
}

/**
 * Get product location by BNR (article_number)
 */
export async function getProductLocationByBnr(
  storeId: string,
  bnr: string,
): Promise<ProductNavigationResult | null> {
  const { data: product } = await supabase
    .from("products")
    .select("id")
    .eq("store_id", storeId)
    .eq("article_number", bnr)
    .single();

  if (!product) return null;

  return getProductLocationByProduct(storeId, product.id);
}

/**
 * Create product location mapping
 */
export async function createProductLocation(
  input: CreateProductLocationInput,
): Promise<ProductLocation | null> {
  // If this is primary, unset other primary for same product
  if (input.is_primary) {
    await supabase
      .from("product_locations")
      .update({ is_primary: false })
      .eq("store_id", input.store_id)
      .eq("product_id", input.product_id)
      .eq("is_primary", true);
  }

  const { data, error } = await supabase
    .from("product_locations")
    .insert({
      store_id: input.store_id,
      product_id: input.product_id,
      marker_id: input.marker_id,
      shelf_position: input.shelf_position ?? null,
      facings: input.facings ?? 1,
      is_primary: input.is_primary ?? false,
    })
    .select(
      `
      *,
      product:products!product_id(id, name, ean, article_number, brand, image_url),
      marker:spatial_markers!marker_id(id, name, marker_type, map_id, position_x, position_y, position_z)
    `,
    )
    .single();

  if (error) {
    console.error("Failed to create product location:", error);
    return null;
  }

  return data as ProductLocation;
}

/**
 * Update product location
 */
export async function updateProductLocation(
  locationId: string,
  input: UpdateProductLocationInput,
): Promise<ProductLocation | null> {
  // If setting as primary, unset other primary for same product
  if (input.is_primary) {
    const { data: current } = await supabase
      .from("product_locations")
      .select("store_id, product_id")
      .eq("id", locationId)
      .single();

    if (current) {
      await supabase
        .from("product_locations")
        .update({ is_primary: false })
        .eq("store_id", current.store_id)
        .eq("product_id", current.product_id)
        .eq("is_primary", true)
        .neq("id", locationId);
    }
  }

  const { data, error } = await supabase
    .from("product_locations")
    .update({
      shelf_position: input.shelf_position ?? null,
      facings: input.facings ?? 1,
      is_primary: input.is_primary ?? false,
    })
    .eq("id", locationId)
    .select(
      `
      *,
      product:products!product_id(id, name, ean, article_number, brand, image_url),
      marker:spatial_markers!marker_id(id, name, marker_type, map_id, position_x, position_y, position_z)
    `,
    )
    .single();

  if (error) {
    console.error("Failed to update product location:", error);
    return null;
  }

  return data as ProductLocation;
}

/**
 * Delete product location
 */
export async function deleteProductLocation(locationId: string): Promise<boolean> {
  const { error } = await supabase.from("product_locations").delete().eq("id", locationId);

  return !error;
}

/**
 * Bulk create product locations from planogram import
 */
export async function bulkCreateFromPlanogram(
  storeId: string,
  planogramProducts: Array<{
    product_id: string;
    marker_id: string;
    shelf_number: number;
    position_index: number;
    facings: number;
  }>,
): Promise<number> {
  const inserts = planogramProducts.map((p, index) => ({
    store_id: storeId,
    product_id: p.product_id,
    marker_id: p.marker_id,
    shelf_position: {
      shelf_number: p.shelf_number,
      position_index: p.position_index,
      x_offset: 0,
      y_offset: 0,
    },
    facings: p.facings,
    is_primary: index === 0, // First location for each product is primary
  }));

  const { error } = await supabase.from("product_locations").upsert(inserts, {
    onConflict: "store_id,product_id,marker_id",
    ignoreDuplicates: false,
  });

  if (error) {
    console.error("Failed to bulk create product locations:", error);
    return 0;
  }

  return inserts.length;
}

// ============================================================================
// Search & Navigation Helpers
// ============================================================================

export interface ProductSearchResult {
  id: string;
  name: string;
  ean: string | null;
  article_number: string | null; // BNR
  brand: string | null;
  image_url: string | null;
  primary_location: ProductLocation | null;
  has_location: boolean;
}

/**
 * Search products by name, EAN, or BNR with location info
 */
export async function searchProductsWithLocation(
  storeId: string,
  query: string,
  options?: {
    limit?: number;
    include_without_location?: boolean;
  },
): Promise<ProductSearchResult[]> {
  const searchTerm = query.trim();

  if (!searchTerm) return [];

  let productsQuery = supabase
    .from("products")
    .select(
      `
      id,
      name,
      ean,
      article_number,
      brand,
      image_url,
      product_locations!inner(id, marker_id, is_primary, marker:spatial_markers!marker_id(id, name, marker_type, map_id, position_x, position_y, position_z))
    `,
    )
    .eq("store_id", storeId)
    .limit(options?.limit ?? 20);

  // Search by name (ILIKE), EAN, or BNR (article_number)
  const isEan = /^\d{8,14}$/.test(searchTerm);
  const isBnr = /^\d{4,8}$/.test(searchTerm) && !isEan;

  if (isEan) {
    productsQuery = productsQuery.eq("ean", searchTerm);
  } else if (isBnr) {
    productsQuery = productsQuery.eq("article_number", searchTerm);
  } else {
    productsQuery = productsQuery.ilike("name", `%${searchTerm}%`);
  }

  const { data: products, error } = await productsQuery;

  if (error) {
    console.error("Failed to search products:", error);
    return [];
  }

  // Transform to search results with location info
  const results: ProductSearchResult[] = (products ?? []).map((p: any) => {
    const locations = p.product_locations ?? [];
    const primary = locations.find((l: any) => l.is_primary) ?? locations[0];

    return {
      id: p.id,
      name: p.name,
      ean: p.ean,
      article_number: p.article_number,
      brand: p.brand,
      image_url: p.image_url,
      primary_location: primary ?? null,
      has_location: locations.length > 0,
    };
  });

  // Filter out products without location if requested
  if (!options?.include_without_location) {
    return results.filter((r) => r.has_location);
  }

  return results;
}

/**
 * Get all products with locations for a store (for map rendering)
 */
export async function getAllProductsWithLocations(storeId: string): Promise<ProductSearchResult[]> {
  const { data: products, error } = await supabase
    .from("products")
    .select(
      `
      id,
      name,
      ean,
      article_number,
      brand,
      image_url,
      product_locations!inner(id, marker_id, is_primary, marker:spatial_markers!marker_id(id, name, marker_type, map_id, position_x, position_y, position_z))
    `,
    )
    .eq("store_id", storeId);

  if (error) {
    console.error("Failed to fetch products with locations:", error);
    return [];
  }

  return (products ?? []).map((p: any) => {
    const locations = p.product_locations ?? [];
    const primary = locations.find((l: any) => l.is_primary) ?? locations[0];

    return {
      id: p.id,
      name: p.name,
      ean: p.ean,
      article_number: p.article_number,
      brand: p.brand,
      image_url: p.image_url,
      primary_location: primary ?? null,
      has_location: locations.length > 0,
    };
  });
}

/**
 * Get Mitt Coop URL for a product (EAN or BNR)
 * Uses centralized URL builder from supabase.ts
 */
export function getMittCoopUrlForProduct(
  product: { ean?: string | null; article_number?: string | null },
  sapSiteId: string,
): string | null {
  if (product.ean) {
    return mittCoopSearchUrl(product.ean, sapSiteId);
  }
  if (product.article_number) {
    return mittCoopSearchUrl(product.article_number, sapSiteId);
  }
  return null;
}

/**
 * Get shelf position as 3D coordinate for AR navigation
 */
export function getShelfPosition3D(
  location: ProductLocation,
  markerPosition: Vector3,
): Vector3 | null {
  if (!location.shelf_position) return null;

  // Calculate 3D position based on marker position + shelf offset
  // shelf_position.x_offset and y_offset are in meters relative to marker
  return {
    x: markerPosition.x + (location.shelf_position.x_offset ?? 0),
    y: markerPosition.y + (location.shelf_position.y_offset ?? 0),
    z: markerPosition.z ?? 0 + location.shelf_position.shelf_number * 0.4, // ~40cm per shelf level
  };
}
