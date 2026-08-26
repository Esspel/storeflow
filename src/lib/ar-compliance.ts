export type ComplianceLevel = "green" | "yellow" | "red";
export type ComplianceResult = {
  level: ComplianceLevel;
  message: string;
  expected_position?: { hylla_id: string; nivå: number };
  suggestion?: string;
};

export async function checkEanAtShelf(
  storeId: string,
  ean: string,
  sektionId: string,
  nivå: number
): Promise<ComplianceResult> {
  const { data: product } = await (await import("@/lib/supabase")).supabase
    .from("products")
    .select("material_nr, produktnamn")
    .eq("ean", ean)
    .maybeSingle();
  if (!product) return { level: "red", message: "EAN hittades inte i produktregistret." };
  const { data: expected } = await (await import("@/lib/supabase")).supabase
    .from("planogram_products")
    .select("hylla_id, nivå, sektion_id")
    .eq("ean", ean)
    .eq("sektion_id", sektionId)
    .maybeSingle();
  if (!expected) {
    return { level: "yellow", message: `${product.produktnamn} saknar godkänd placering.`, suggestion: "Kontrollera planogram." };
  }
  if (expected.nivå === nivå) {
    return { level: "green", message: `${product.produktnamn} står rätt.`, expected_position: { hylla_id: expected.hylla_id, nivå: expected.nivå } };
  }
  return { level: "yellow", message: `${product.produktnamn} står fel — borde vara nivå ${expected.nivå}.`, expected_position: { hylla_id: expected.hylla_id, nivå: expected.nivå }, suggestion: `Flytta till nivå ${expected.nivå}.` };
}
