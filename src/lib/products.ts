/**
 * Product matching and upsert helpers.
 * - material_nr is the primary key for delivery imports.
 * - ean / bnr come from planograms and deliveries.
 */
import { supabase } from "@/lib/supabase";

export type Product = {
  material_nr: string;
  bnr: string | null;
  ean: string | null;
  varumarke: string | null;
  produktnamn: string;
  hallbarhetsdagar_tillverkning: number | null;
};

export async function findProductByMaterialNr(material_nr: string) {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("material_nr", material_nr)
    .maybeSingle();
  if (error) throw error;
  return data as Product | null;
}

/** Returns true if the same material_nr has been delivered with "short" date
 * (less than `daysAhead` from delivery) >=2 times in the last `windowDays`. */
export async function isRepeatedShortDate(
  storeId: string,
  material_nr: string,
  daysAhead = 7,
  windowDays = 30
): Promise<boolean> {
  const since = new Date(Date.now() - windowDays * 86400000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("product_shelf_life")
    .select("best_före_datum, leveransdag")
    .eq("store_id", storeId)
    .eq("material_nr", material_nr)
    .gte("leveransdag", since);
  if (error) throw error;
  if (!data || data.length < 2) return false;
  const shortCount = data.filter((r: any) => {
    const diff = (new Date(r.best_före_datum).getTime() - new Date(r.leveransdag).getTime()) / 86400000;
    return diff < daysAhead;
  }).length;
  return shortCount >= 2;
}

export function diffProductPayload(
  existing: Partial<Product>,
  incoming: Partial<Product>
): string[] {
  const conflicts: string[] = [];
  for (const k of Object.keys(incoming) as (keyof Product)[]) {
    if (k === "material_nr") continue;
    if (incoming[k] !== null && existing[k] !== incoming[k]) {
      conflicts.push(k);
    }
  }
  return conflicts;
}

export async function upsertProduct(payload: Product) {
  const { data, error } = await supabase
    .from("products")
    .upsert(payload, { onConflict: "material_nr" })
    .select()
    .single();
  if (error) throw error;
  return data as Product;
}
