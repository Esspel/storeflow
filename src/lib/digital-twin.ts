import { supabase } from "@/lib/supabase";
import type { Section2D } from "@/components/store-map-2d";
import type { PlacedMarker, ProductLink, DigitalTwinSnapshot } from "@/types/digital-twin";

export async function loadSnapshot(storeId: string): Promise<DigitalTwinSnapshot> {
  const [mapsRes, sectionsRes] = await Promise.all([
    supabase
      .from("spatial_maps")
      .select("id")
      .eq("store_id", storeId)
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("store_sections")
      .select("id, name, pos_x_cm, pos_y_cm, width_cm, height_cm")
      .eq("store_id", storeId),
  ]);

  const mapId = mapsRes.data?.id ?? null;
  const sections: Section2D[] = (sectionsRes.data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    pos_x_cm: s.pos_x_cm,
    pos_y_cm: s.pos_y_cm,
    width_cm: s.width_cm,
    height_cm: s.height_cm,
  }));

  let markers: PlacedMarker[] = [];
  if (mapId) {
    const { data } = await supabase
      .from("spatial_markers")
      .select("id, aruco_id, position, size_meters")
      .eq("map_id", mapId);
    markers = (data ?? []).map((m) => ({
      id: m.id,
      arucoId: m.aruco_id ?? 0,
      position: {
        x: m.position?.x ?? 0,
        y: m.position?.y ?? 0,
        z: m.position?.z ?? 0,
      },
      sizeMeters: m.size_meters ?? 0.15,
    }));
  }

  return { spatialMapId: mapId, sections, markers, productLinks: [] };
}

export async function ensureSpatialMap(storeId: string): Promise<string> {
  const { data: existing } = await supabase
    .from("spatial_maps")
    .select("id")
    .eq("store_id", storeId)
    .eq("is_active", true)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data, error } = await supabase
    .from("spatial_maps")
    .insert({ store_id: storeId, name: "Digital Twin", is_active: true })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function saveSection(storeId: string, section: Section2D): Promise<void> {
  const { error } = await supabase.from("store_sections").upsert({
    id: section.id,
    store_id: storeId,
    name: section.name,
    pos_x_cm: section.pos_x_cm,
    pos_y_cm: section.pos_y_cm,
    width_cm: section.width_cm,
    height_cm: section.height_cm,
  });
  if (error) throw error;
}

export async function deleteSection(sectionId: string): Promise<void> {
  const { error } = await supabase.from("store_sections").delete().eq("id", sectionId);
  if (error) throw error;
}

export async function placeMarker(
  mapId: string,
  arucoId: number,
  position: { x: number; y: number; z: number },
): Promise<string> {
  const { data, error } = await supabase
    .from("spatial_markers")
    .insert({
      map_id: mapId,
      marker_type: "aruco",
      aruco_id: arucoId,
      position,
      size_meters: 0.15,
      is_active: true,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function moveMarker(
  markerId: string,
  position: { x: number; y: number; z: number },
): Promise<void> {
  const { error } = await supabase.from("spatial_markers").update({ position }).eq("id", markerId);
  if (error) throw error;
}

export async function removeMarker(markerId: string): Promise<void> {
  const { error } = await supabase.from("spatial_markers").delete().eq("id", markerId);
  if (error) throw error;
}

export async function getSpatialMap(storeId: string) {
  const { data, error } = await supabase
    .from("spatial_maps")
    .select("id, name, markers, routes")
    .eq("store_id", storeId)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    store_id: storeId,
    name: data.name ?? "Digital Twin",
    markers: Array.isArray(data.markers) ? (data.markers as any[]) : [],
    routes: Array.isArray(data.routes) ? (data.routes as any[]) : [],
  };
}

export async function getShelfCompliance(storeId: string, shelfMarkerId?: string) {
  // Load planogram expectations for this store
  const planRes = await supabase
    .from("shelf_planograms")
    .select("id, shelf_marker_id, expected_products")
    .eq("store_id", storeId)
    .eq("is_active", true);
  if (planRes.error) throw planRes.error;
  const plans = (planRes.data ?? []) as any[];

  // Aggregate actual deliveries (store-specific history)
  const delRes = await supabase
    .from("store_product_deliveries")
    .select("ean, quantity, arrival_date")
    .eq("store_id", storeId);
  const delData = (delRes.data ?? []) as any[];
  const actualByEan = new Map<string, number>();
  for (const d of delData) {
    const qty = Number(d.quantity ?? 0);
    actualByEan.set(d.ean, (actualByEan.get(d.ean) ?? 0) + qty);
  }

  let score = 100;
  let missing = 0;
  let misplaced = 0;
  let extra = 0;

  for (const p of plans) {
    const expected = Array.isArray(p.expected_products) ? p.expected_products : [];
    for (const e of expected) {
      const expQty = Number(e.quantity ?? e.facings ?? 1);
      const actQty = actualByEan.get(e.ean) ?? 0;
      if (actQty < expQty) missing += (expQty - actQty);
      if (actQty > expQty) extra += (actQty - expQty);
    }
  }

  // Simple score heuristic based on missing/extra relative to total expected
  const totalExpected = plans.reduce(
    (s, p) => s + ((Array.isArray(p.expected_products) ? p.expected_products : []) as any[]).reduce((acc, e) => acc + (Number(e.quantity ?? e.facings ?? 1)), 0),
    0,
  );
  const totalActual = Array.from(actualByEan.values()).reduce((a, b) => a + b, 0);
  if (totalExpected > 0) {
    const deviation = Math.abs(totalActual - totalExpected);
    score = Math.max(0, Math.round(100 - (deviation / totalExpected) * 100));
  }

  return { score, missing, misplaced, extra, plans, actualByEan };
}

export async function listPlanogramsForStore(storeId: string) {
  const { data, error } = await supabase
    .from("shelf_planograms")
    .select("id, name, shelf_marker_id, expected_products")
    .eq("store_id", storeId)
    .eq("is_active", true);
  if (error) throw error;
  return data ?? [];
}

export async function recordObservation(storeId: string, link: ProductLink): Promise<void> {
  const { error } = await supabase.from("shelf_observations").insert({
    store_id: storeId,
    shelf_marker_id: link.markerId,
    detected_products: [{ ean: link.ean, bnr: link.bnr, name: link.name, facings: link.facings }],
    compliance_score: link.fromPlanogram ? 1.0 : 0.5,
  });
  if (error) throw error;
}
