/**
 * Spatial Index - Marker database and spatial queries
 * Provides spatial data structures for marker management, nearest neighbor search, and pathfinding
 */

import type {
  SpatialMarker,
  SpatialMap,
  Vector3,
  MarkerType,
  Quaternion,
} from "@/lib/posemesh/types";
import { supabase } from "@/lib/supabase";

// ============================================================================
// In-memory spatial index for fast queries
// ============================================================================

interface SpatialIndexEntry {
  marker: SpatialMarker;
  // Precomputed for fast distance calculations
  position: Vector3;
}

class SpatialIndex {
  private markers: Map<string, SpatialIndexEntry> = new Map();
  private markersByMap: Map<string, Set<string>> = new Map();
  private markersByType: Map<MarkerType, Set<string>> = new Map();

  /** Add a marker to the index */
  add(marker: SpatialMarker): void {
    const entry: SpatialIndexEntry = {
      marker,
      position: marker.position,
    };

    this.markers.set(marker.id, entry);

    // Index by map
    const mapMarkers = this.markersByMap.get(marker.map_id) || new Set();
    mapMarkers.add(marker.id);
    this.markersByMap.set(marker.map_id, mapMarkers);

    // Index by type
    const typeMarkers = this.markersByType.get(marker.marker_type) || new Set();
    typeMarkers.add(marker.id);
    this.markersByType.set(marker.marker_type, typeMarkers);
  }

  /** Update a marker's position in the index */
  updatePosition(markerId: string, position: Vector3, rotation?: Quaternion): void {
    const entry = this.markers.get(markerId);
    if (entry) {
      entry.position = position;
      entry.marker.position = position;
      if (rotation) entry.marker.rotation = rotation;
    }
  }

  /** Remove a marker from the index */
  remove(markerId: string): void {
    const entry = this.markers.get(markerId);
    if (!entry) return;

    this.markers.delete(markerId);

    // Remove from map index
    const mapMarkers = this.markersByMap.get(entry.marker.map_id);
    if (mapMarkers) {
      mapMarkers.delete(markerId);
      if (mapMarkers.size === 0) {
        this.markersByMap.delete(entry.marker.map_id);
      }
    }

    // Remove from type index
    const typeMarkers = this.markersByType.get(entry.marker.marker_type);
    if (typeMarkers) {
      typeMarkers.delete(markerId);
      if (typeMarkers.size === 0) {
        this.markersByType.delete(entry.marker.marker_type);
      }
    }
  }

  /** Get marker by ID */
  get(markerId: string): SpatialMarker | undefined {
    return this.markers.get(markerId)?.marker;
  }

  /** Get all markers for a map */
  getByMap(mapId: string): SpatialMarker[] {
    const markerIds = this.markersByMap.get(mapId);
    if (!markerIds) return [];

    return Array.from(markerIds)
      .map((id) => this.markers.get(id)?.marker)
      .filter((m): m is SpatialMarker => m !== undefined);
  }

  /** Get all markers of a specific type */
  getByType(type: MarkerType): SpatialMarker[] {
    const markerIds = this.markersByType.get(type);
    if (!markerIds) return [];

    return Array.from(markerIds)
      .map((id) => this.markers.get(id)?.marker)
      .filter((m): m is SpatialMarker => m !== undefined);
  }

  /** Get markers for a map and type */
  getByMapAndType(mapId: string, type: MarkerType): SpatialMarker[] {
    const mapMarkerIds = this.markersByMap.get(mapId);
    const typeMarkerIds = this.markersByType.get(type);

    if (!mapMarkerIds || !typeMarkerIds) return [];

    // Intersect the sets
    const intersection = new Set([...mapMarkerIds].filter((id) => typeMarkerIds.has(id)));

    return Array.from(intersection)
      .map((id) => this.markers.get(id)?.marker)
      .filter((m): m is SpatialMarker => m !== undefined);
  }

  /** Find nearest markers to a position */
  findNearest(
    position: Vector3,
    options: {
      mapId?: string;
      type?: MarkerType;
      maxResults?: number;
      maxDistanceMeters?: number;
    } = {},
  ): Array<{ marker: SpatialMarker; distance: number }> {
    const { mapId, type, maxResults = 10, maxDistanceMeters } = options;

    let candidates: SpatialIndexEntry[];

    if (mapId && type) {
      const mapMarkerIds = this.markersByMap.get(mapId);
      const typeMarkerIds = this.markersByType.get(type);
      if (!mapMarkerIds || !typeMarkerIds) return [];

      const intersection = new Set([...mapMarkerIds].filter((id) => typeMarkerIds.has(id)));

      candidates = Array.from(intersection)
        .map((id) => this.markers.get(id))
        .filter((e): e is SpatialIndexEntry => e !== undefined);
    } else if (mapId) {
      const mapMarkerIds = this.markersByMap.get(mapId);
      if (!mapMarkerIds) return [];

      candidates = Array.from(mapMarkerIds)
        .map((id) => this.markers.get(id))
        .filter((e): e is SpatialIndexEntry => e !== undefined);
    } else if (type) {
      const typeMarkerIds = this.markersByType.get(type);
      if (!typeMarkerIds) return [];

      candidates = Array.from(typeMarkerIds)
        .map((id) => this.markers.get(id))
        .filter((e): e is SpatialIndexEntry => e !== undefined);
    } else {
      candidates = Array.from(this.markers.values());
    }

    // Calculate distances and sort
    const results = candidates
      .map((entry) => ({
        marker: entry.marker,
        distance: calculateDistance(position, entry.position),
      }))
      .filter((r) => maxDistanceMeters === undefined || r.distance <= maxDistanceMeters)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, maxResults);

    return results;
  }

  /** Find markers within a bounding box */
  findInBounds(min: Vector3, max: Vector3, mapId?: string): SpatialMarker[] {
    let candidates: SpatialIndexEntry[];

    if (mapId) {
      const mapMarkerIds = this.markersByMap.get(mapId);
      if (!mapMarkerIds) return [];

      candidates = Array.from(mapMarkerIds)
        .map((id) => this.markers.get(id))
        .filter((e): e is SpatialIndexEntry => e !== undefined);
    } else {
      candidates = Array.from(this.markers.values());
    }

    return candidates
      .filter((entry) => {
        const pos = entry.position;
        return (
          pos.x >= min.x &&
          pos.x <= max.x &&
          pos.y >= min.y &&
          pos.y <= max.y &&
          pos.z >= min.z &&
          pos.z <= max.z
        );
      })
      .map((entry) => entry.marker);
  }

  /** Clear the index */
  clear(): void {
    this.markers.clear();
    this.markersByMap.clear();
    this.markersByType.clear();
  }

  /** Get total marker count */
  size(): number {
    return this.markers.size;
  }
}

// ============================================================================
// Distance calculations
// ============================================================================

function calculateDistance(a: Vector3, b: Vector3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// ============================================================================
// Pathfinding (A* algorithm)
// ============================================================================

interface PathNode {
  markerId: string;
  gScore: number; // Cost from start
  fScore: number; // Estimated total cost
  cameFrom: string | null;
}

interface GraphEdge {
  from: string;
  to: string;
  distance: number;
}

/** Build graph from spatial routes */
function buildGraph(routes: SpatialRoute[]): Map<string, GraphEdge[]> {
  const graph = new Map<string, GraphEdge[]>();

  for (const route of routes) {
    // Add forward edge
    const fromEdges = graph.get(route.from_marker_id) || [];
    fromEdges.push({
      from: route.from_marker_id,
      to: route.to_marker_id,
      distance: route.distance_meters,
    });
    graph.set(route.from_marker_id, fromEdges);

    // Add reverse edge (bidirectional)
    const toEdges = graph.get(route.to_marker_id) || [];
    toEdges.push({
      from: route.to_marker_id,
      to: route.from_marker_id,
      distance: route.distance_meters,
    });
    graph.set(route.to_marker_id, toEdges);
  }

  return graph;
}

/** A* pathfinding between markers */
export async function findPath(
  index: SpatialIndex,
  routes: SpatialRoute[],
  fromMarkerId: string,
  toMarkerId: string,
): Promise<string[] | null> {
  const graph = buildGraph(routes);
  const fromMarker = index.get(fromMarkerId);
  const toMarker = index.get(toMarkerId);

  if (!fromMarker || !toMarker) return null;

  const openSet = new Map<string, PathNode>();
  const closedSet = new Set<string>();

  // Heuristic: straight-line distance
  const heuristic = (markerId: string): number => {
    const marker = index.get(markerId);
    if (!marker) return Infinity;
    return calculateDistance(marker.position, toMarker.position);
  };

  // Initialize start node
  const startNode: PathNode = {
    markerId: fromMarkerId,
    gScore: 0,
    fScore: heuristic(fromMarkerId),
    cameFrom: null,
  };
  openSet.set(fromMarkerId, startNode);

  while (openSet.size > 0) {
    // Find node with lowest fScore
    let current: PathNode | null = null;
    let currentId = "";

    for (const [id, node] of openSet) {
      if (!current || node.fScore < current.fScore) {
        current = node;
        currentId = id;
      }
    }

    if (!current) break;

    // Check if we reached the goal
    if (currentId === toMarkerId) {
      // Reconstruct path
      const path: string[] = [];
      let node: PathNode | null = current;
      while (node) {
        path.unshift(node.markerId);
        node = node.cameFrom ? openSet.get(node.cameFrom) || null : null;
      }
      return path;
    }

    openSet.delete(currentId);
    closedSet.add(currentId);

    // Explore neighbors
    const edges = graph.get(currentId) || [];
    for (const edge of edges) {
      if (closedSet.has(edge.to)) continue;

      const tentativeGScore = current.gScore + edge.distance;
      const existingNode = openSet.get(edge.to);

      if (!existingNode || tentativeGScore < existingNode.gScore) {
        const newNode: PathNode = {
          markerId: edge.to,
          gScore: tentativeGScore,
          fScore: tentativeGScore + heuristic(edge.to),
          cameFrom: currentId,
        };
        openSet.set(edge.to, newNode);
      }
    }
  }

  return null; // No path found
}

// ============================================================================
// Supabase integration
// ============================================================================

/** Load all markers for a store into the index */
export async function loadSpatialIndexForStore(
  storeId: string,
): Promise<{ index: SpatialIndex; map: SpatialMap | null }> {
  const index = new SpatialIndex();

  // Get active spatial map for store
  const { data: maps, error: mapError } = await supabase
    .from("spatial_maps")
    .select("*")
    .eq("store_id", storeId)
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1);

  if (mapError) throw mapError;

  const map = maps?.[0] || null;
  if (!map) return { index, map: null };

  // Get all markers for this map
  const { data: markers, error: markerError } = await supabase
    .from("spatial_markers")
    .select("*")
    .eq("map_id", map.id);

  if (markerError) throw markerError;

  markers?.forEach((marker) => index.add(marker as SpatialMarker));

  return { index, map };
}

/** Save a new marker to Supabase and update index */
export async function saveMarker(
  index: SpatialIndex,
  marker: Omit<SpatialMarker, "id" | "created_at">,
): Promise<SpatialMarker> {
  const { data, error } = await supabase
    .from("spatial_markers")
    .insert({
      ...marker,
      position: marker.position,
      rotation: marker.rotation,
      metadata: marker.metadata,
    })
    .select()
    .single();

  if (error) throw error;

  const savedMarker = data as SpatialMarker;
  index.add(savedMarker);
  return savedMarker;
}

/** Update marker position */
export async function updateMarkerPosition(
  index: SpatialIndex,
  markerId: string,
  position: Vector3,
  rotation?: Quaternion,
): Promise<void> {
  const updates: Record<string, unknown> = { position };
  if (rotation) updates.rotation = rotation;

  const { error } = await supabase.from("spatial_markers").update(updates).eq("id", markerId);

  if (error) throw error;

  // Update index
  index.updatePosition(markerId, position, rotation);
}

/** Delete a marker */
export async function deleteMarker(index: SpatialIndex, markerId: string): Promise<void> {
  const { error } = await supabase.from("spatial_markers").delete().eq("id", markerId);

  if (error) throw error;

  index.remove(markerId);
}

// ============================================================================
// React hook for spatial index
// ============================================================================

import { useState, useEffect, useCallback } from "react";

export function useSpatialIndex(storeId: string) {
  const [index, setIndex] = useState<SpatialIndex | null>(null);
  const [map, setMap] = useState<SpatialMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loadSpatialIndexForStore(storeId);
      setIndex(result.index);
      setMap(result.map);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    load();
  }, [load]);

  return { index, map, loading, error, reload: load };
}

// ============================================================================
// Types for pathfinding
// ============================================================================

export interface SpatialRoute {
  id: string;
  map_id: string;
  from_marker_id: string;
  to_marker_id: string;
  distance_meters: number;
  path: string[];
  created_at: string;
}

// ============================================================================
// Singleton instance for global access
// ============================================================================

let globalIndex: SpatialIndex | null = null;

export function getGlobalSpatialIndex(): SpatialIndex {
  if (!globalIndex) {
    globalIndex = new SpatialIndex();
  }
  return globalIndex;
}

export function setGlobalSpatialIndex(index: SpatialIndex): void {
  globalIndex = index;
}
