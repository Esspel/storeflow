/**
 * Coop Product Lookup — Datadriven, inga externa API:er
 * Alla produktuppslag sker mot Supabase-tabellen `products`.
 * Produkter skapas/updateras dynamiskt vid filimport (Excel/TSV/PDF) — aldrig statiska listor.
 */

import { supabase } from "./supabase";

export interface CoopProduct {
  id?: string;
  sap_article_id?: string;
  name: string;
  ean?: string;
  bnr?: string;
  brand?: string;
  size?: string;
  category?: string;
  price?: number;
  imageUrl?: string;
  productUrl?: string;
  store_id?: string;
}

/**
 * Slå upp produkt i Supabase på EAN eller BNR.
 * Om produkten inte finns — returnera null (skapas vid nästa import).
 */
export async function lookupProductByEan(
  ean: string,
  storeId?: string
): Promise<CoopProduct | null> {
  let query = supabase
    .from("products")
    .select("id, sap_article_id, name, ean, bnr, brand, size, category, price, image_url, product_url, store_id")
    .eq("ean", ean);
  if (storeId) query = query.eq("store_id", storeId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data ? (data as CoopProduct) : null;
}

export async function lookupProductByBnr(
  bnr: string,
  storeId?: string
): Promise<CoopProduct | null> {
  let query = supabase
    .from("products")
    .select("id, sap_article_id, name, ean, bnr, brand, size, category, price, image_url, product_url, store_id")
    .eq("bnr", bnr);
  if (storeId) query = query.eq("store_id", storeId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data ? (data as CoopProduct) : null;
}

export async function searchProducts(
  query: string,
  storeId?: string
): Promise<CoopProduct[]> {
  let q = supabase
    .from("products")
    .select("id, sap_article_id, name, ean, bnr, brand, size, category, price, image_url, product_url, store_id")
    .ilike("name", `%${query}%`);
  if (storeId) q = q.eq("store_id", storeId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as CoopProduct[];
}

/**
 * Upsert-produkt från import (XLSX/TSV/PDF-planogram).
 * Uppdaterar eller skapar baserat på ean/bnr.
 */
export async function upsertProductFromImport(
  product: Partial<CoopProduct>,
  storeId: string
): Promise<CoopProduct | null> {
  const payload = {
    ...product,
    store_id: storeId,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from("products")
    .upsert(payload, { onConflict: "bnr", ignoreDuplicates: false })
    .select()
    .single();
  if (error) throw error;
  return data as CoopProduct;
}
