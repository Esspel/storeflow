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

export async function saveSection(
  storeId: string,
  section: Section2D,
): Promise<void> {
  const { error } = await supabase
    .from("store_sections")
    .upsert({
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
  const { error } = await supabase
    .from("store_sections")
    .delete()
    .eq("id", sectionId);
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
  const { error } = await supabase
    .from("spatial_markers")
    .update({ position })
    .eq("id", markerId);
  if (error) throw error;
}

export async function removeMarker(markerId: string): Promise<void> {
  const { error } = await supabase
    .from("spatial_markers")
    .delete()
    .eq("id", markerId);
  if (error) throw error;
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

export async function recordObservation(
  storeId: string,
  link: ProductLink,
): Promise<void> {
  const { error } = await supabase.from("shelf_observations").insert({
    store_id: storeId,
    shelf_marker_id: link.markerId,
    detected_products: [
      { ean: link.ean, bnr: link.bnr, name: link.name, facings: link.facings },
    ],
    compliance_score: link.fromPlanogram ? 1.0 : 0.5,
  });
  if (error) throw error;
}