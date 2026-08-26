/**
 * Route Optimizer Library
 * A* pathfinding on auto-generated visibility graph + admin overrides
 * For spatial navigation in StoreFlow
 */

import { supabase } from "@/lib/supabase";
import type { Vector3 } from "@/lib/posemesh/types";

// ============================================================================
// Types
// ============================================================================

export interface RouteNode {
  id: string;
  position: Vector3;
  marker_id: string;
  marker_type: string;
  name: string;
  map_id: string;
  // Admin overrides
  is_blocked?: boolean;
  custom_weight?: number;
}

export interface RouteEdge {
  from: string;
  to: string;
  distance: number;
  // Admin overrides
  is_blocked?: boolean;
  custom_weight?: number;
}

export interface VisibilityGraph {
  nodes: Map<string, RouteNode>;
  edges: Map<string, RouteEdge[]>; // adjacency list
  bounds: {
    min: Vector3;
    max: Vector3;
  };
}

export interface RouteResult {
  path: RouteNode[];
  total_distance: number;
  estimated_time_seconds: number;
  waypoints: Vector3[];
}

export interface OptimizeRouteOptions {
  map_id: string;
  start_marker_id: string;
  end_marker_id: string;
  route_type?: "shortest" | "fastest" | "accessible";
  avoid_markers?: string[];
  preferences?: {
    avoid_stairs?: boolean;
    prefer_wide_aisles?: boolean;
  };
}

export interface MultiStopOptimizeOptions {
  map_id: string;
  start_marker_id: string;
  stop_marker_ids: string[];
  return_to_start?: boolean;
  route_type?: "shortest" | "fastest";
}

// ============================================================================
// Constants
// ============================================================================

const WALKING_SPEED_M_S = 1.4; // m/s average walking speed
const EDGE_WEIGHT_MULTIPLIER = 1.0;
const HEURISTIC_WEIGHT = 1.0; // A* heuristic weight (1.0 = optimal, >1.0 = faster but suboptimal)

// ============================================================================
// Graph Building
// ============================================================================

/**
 * Build visibility graph from spatial markers
 * Connects markers with line-of-sight (no obstacles between them)
 */
export async function buildVisibilityGraph(mapId: string): Promise<VisibilityGraph> {
  // Fetch all markers for this map
  const { data: markers, error } = await supabase
    .from("spatial_markers")
    .select("*")
    .eq("map_id", mapId);

  if (error) {
    throw new Error(`Failed to fetch markers: ${error.message}`);
  }

  if (!markers || markers.length === 0) {
    return {
      nodes: new Map(),
      edges: new Map(),
      bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } },
    };
  }

  const nodes = new Map<string, RouteNode>();
  const edges = new Map<string, RouteEdge[]>();

  // Create nodes
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const marker of markers) {
    const position: Vector3 = {
      x: marker.position_x,
      y: marker.position_y,
      z: marker.position_z ?? 0,
    };

    minX = Math.min(minX, position.x);
    minY = Math.min(minY, position.y);
    minZ = Math.min(minZ, position.z);
    maxX = Math.max(maxX, position.x);
    maxY = Math.max(maxY, position.y);
    maxZ = Math.max(maxZ, position.z);

    const node: RouteNode = {
      id: marker.id,
      position,
      marker_id: marker.id,
      marker_type: marker.marker_type,
      name: marker.name ?? `Marker ${marker.id.slice(0, 8)}`,
      map_id: marker.map_id,
    };

    nodes.set(marker.id, node);
    edges.set(marker.id, []);
  }

  // Create edges between visible markers (line-of-sight)
  // For now, connect all markers within reasonable distance
  // In production, this would check against obstacles/walls from spatial_maps
  const MAX_CONNECTION_DISTANCE = 50; // meters

  for (const [fromId, fromNode] of nodes) {
    for (const [toId, toNode] of nodes) {
      if (fromId === toId) continue;

      const distance = calculateDistance(fromNode.position, toNode.position);

      if (distance <= MAX_CONNECTION_DISTANCE) {
        // Check line of sight (simplified - in production would raycast against walls)
        const hasLineOfSight = await checkLineOfSight(mapId, fromNode.position, toNode.position);

        if (hasLineOfSight) {
          const edge: RouteEdge = {
            from: fromId,
            to: toId,
            distance,
          };

          edges.get(fromId)?.push(edge);
        }
      }
    }
  }

  // Fetch admin route overrides
  await applyRouteOverrides(mapId, nodes, edges);

  return {
    nodes,
    edges,
    bounds: {
      min: { x: minX, y: minY, z: minZ },
      max: { x: maxX, y: maxY, z: maxZ },
    },
  };
}

/**
 * Apply admin route overrides from spatial_routes table
 */
async function applyRouteOverrides(
  mapId: string,
  nodes: Map<string, RouteNode>,
  edges: Map<string, RouteEdge[]>
): Promise<void> {
  const { data: routes, error } = await supabase
    .from("spatial_routes")
    .select("*")
    .eq("map_id", mapId);

  if (error || !routes) return;

  for (const route of routes) {
    if (route.is_blocked) {
      // Block edge
      const fromEdges = edges.get(route.from_marker_id);
      if (fromEdges) {
        const edgeIndex = fromEdges.findIndex((e) => e.to === route.to_marker_id);
        if (edgeIndex !== -1) {
          fromEdges[edgeIndex].is_blocked = true;
        }
      }
    } else if (route.custom_weight !== null && route.custom_weight !== undefined) {
      // Custom weight
      const fromEdges = edges.get(route.from_marker_id);
      if (fromEdges) {
        const edgeIndex = fromEdges.findIndex((e) => e.to === route.to_marker_id);
        if (edgeIndex !== -1) {
          fromEdges[edgeIndex].custom_weight = route.custom_weight;
        }
      }
    }
  }
}

/**
 * Line-segment intersection test (2D projection on XZ-plane).
 * Returns true if segments AB and CD intersect (excluding collinear overlap).
 */
function segmentsIntersect(
  a: { x: number; z: number },
  b: { x: number; z: number },
  c: { x: number; z: number },
  d: { x: number; z: number }
): boolean {
  const denom = (d.z - c.z) * (b.x - a.x) - (d.x - c.x) * (b.z - a.z);
  if (Math.abs(denom) < 1e-9) return false; // Parallel
  const ua = ((d.x - c.x) * (a.z - c.z) - (d.z - c.z) * (a.x - c.x)) / denom;
  const ub = ((b.x - a.x) * (a.z - c.z) - (b.z - a.z) * (a.x - c.x)) / denom;
  return ua > 1e-9 && ua < 1 - 1e-9 && ub > 1e-9 && ub < 1 - 1e-9;
}

/**
 * Check line of sight between two points by fetching wall geometry from Supabase.
 * Returns false if the direct segment crosses any wall; true otherwise (or if no walls).
 */
async function checkLineOfSight(
  mapId: string,
  from: Vector3,
  to: Vector3
): Promise<boolean> {
  // 1. Hämta vägggeometri från DB
  const { data: walls, error } = await supabase
    .from("spatial_walls")
    .select("start_pos, end_pos")
    .eq("map_id", mapId);

  if (error) throw error;
  if (!walls || walls.length === 0) return true; // Inga väggar = fri sikt

  // 2. Raycasting / skärningstest på XZ-plan (y ignoreras för enkel 2D-vy)
  const a = { x: from.x, z: from.z ?? 0 };
  const b = { x: to.x, z: to.z ?? 0 };

  for (const w of walls) {
    const start = Array.isArray(w.start_pos)
      ? { x: Number(w.start_pos[0] ?? 0), z: Number(w.start_pos[2] ?? 0) }
      : { x: (w.start_pos as any)?.x ?? 0, z: (w.start_pos as any)?.z ?? 0 };
    const end = Array.isArray(w.end_pos)
      ? { x: Number(w.end_pos[0] ?? 0), z: Number(w.end_pos[2] ?? 0) }
      : { x: (w.end_pos as any)?.x ?? 0, z: (w.end_pos as any)?.z ?? 0 };

    if (segmentsIntersect(a, b, start, end)) {
      return false; // Segment skär vägg = ingen fri sikt
    }
  }

  return true; // Ingen skärning = fri sikt
}

/**
 * Calculate Euclidean distance between two 3D points
 */
function calculateDistance(a: Vector3, b: Vector3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// ============================================================================
// A* Pathfinding
// ============================================================================

interface AStarNode {
  id: string;
  g: number; // cost from start
  h: number; // heuristic to goal
  f: number; // g + h
  parent: string | null;
}

/**
 * Find shortest path using A* algorithm
 */
export async function findPath(options: OptimizeRouteOptions): Promise<RouteResult | null> {
  const graph = await buildVisibilityGraph(options.map_id);

  const startNode = graph.nodes.get(options.start_marker_id);
  const endNode = graph.nodes.get(options.end_marker_id);

  if (!startNode || !endNode) {
    console.warn("Start or end marker not found in graph");
    return null;
  }

  // A* implementation
  const openSet = new Map<string, AStarNode>();
  const closedSet = new Set<string>();

  const startAStar: AStarNode = {
    id: options.start_marker_id,
    g: 0,
    h: heuristic(startNode.position, endNode.position),
    f: 0,
    parent: null,
  };
  startAStar.f = startAStar.g + startAStar.h * HEURISTIC_WEIGHT;
  openSet.set(options.start_marker_id, startAStar);

  while (openSet.size > 0) {
    // Find node with lowest f
    let currentId: string | null = null;
    let currentF = Infinity;

    for (const [id, node] of openSet) {
      if (node.f < currentF) {
        currentF = node.f;
        currentId = id;
      }
    }

    if (!currentId) break;

    const current = openSet.get(currentId)!;
    openSet.delete(currentId);
    closedSet.add(currentId);

    // Check if we reached the goal
    if (currentId === options.end_marker_id) {
      return reconstructPath(current, graph);
    }

    // Explore neighbors
    const neighbors = graph.edges.get(currentId) ?? [];
    for (const edge of neighbors) {
      if (edge.is_blocked) continue;
      if (options.avoid_markers?.includes(edge.to)) continue;
      if (closedSet.has(edge.to)) continue;

      const neighborNode = graph.nodes.get(edge.to);
      if (!neighborNode) continue;

      // Check if neighbor is blocked
      if (neighborNode.is_blocked) continue;

      const edgeWeight = edge.custom_weight ?? edge.distance * EDGE_WEIGHT_MULTIPLIER;
      const tentativeG = current.g + edgeWeight;

      const existing = openSet.get(edge.to);
      if (!existing || tentativeG < existing.g) {
        const h = heuristic(neighborNode.position, endNode.position);
        openSet.set(edge.to, {
          id: edge.to,
          g: tentativeG,
          h,
          f: tentativeG + h * HEURISTIC_WEIGHT,
          parent: currentId,
        });
      }
    }
  }

  // No path found
  return null;
}

/**
 * Heuristic function (Euclidean distance)
 */
function heuristic(a: Vector3, b: Vector3): number {
  return calculateDistance(a, b);
}

/**
 * Reconstruct path from A* result
 */
function reconstructPath(goalNode: AStarNode, graph: VisibilityGraph): RouteResult {
  const path: RouteNode[] = [];
  let current: AStarNode | null = goalNode;

  while (current) {
    const node = graph.nodes.get(current.id);
    if (node) path.unshift(node);
    // Find parent in open/closed sets (simplified - in practice store parent map)
    current = null; // Would need parent tracking
  }

  // Simplified path reconstruction - in real implementation, track parents properly
  const waypoints = path.map((n) => n.position);
  const totalDistance = calculatePathDistance(path);
  const estimatedTime = totalDistance / WALKING_SPEED_M_S;

  return {
    path,
    total_distance: totalDistance,
    estimated_time_seconds: estimatedTime,
    waypoints,
  };
}

function calculatePathDistance(path: RouteNode[]): number {
  let distance = 0;
  for (let i = 1; i < path.length; i++) {
    distance += calculateDistance(path[i - 1].position, path[i].position);
  }
  return distance;
}

// ============================================================================
// Multi-Stop Optimization (TSP approximation)
// ============================================================================

/**
 * Optimize multi-stop route using nearest neighbor + 2-opt improvement
 */
export async function optimizeMultiStop(options: MultiStopOptimizeOptions): Promise<RouteResult | null> {
  const graph = await buildVisibilityGraph(options.map_id);

  const startNode = graph.nodes.get(options.start_marker_id);
  if (!startNode) return null;

  // Validate all stops exist
  const stops: RouteNode[] = [];
  for (const stopId of options.stop_marker_ids) {
    const node = graph.nodes.get(stopId);
    if (!node) return null;
    stops.push(node);
  }

  if (stops.length === 0) {
    return {
      path: [startNode],
      total_distance: 0,
      estimated_time_seconds: 0,
      waypoints: [startNode.position],
    };
  }

  // Nearest neighbor initial solution
  let current = startNode;
  const unvisited = new Set(stops.map((s) => s.id));
  const route: RouteNode[] = [current];

  while (unvisited.size > 0) {
    let nearest: RouteNode | null = null;
    let nearestDist = Infinity;

    for (const stopId of unvisited) {
      const stopNode = graph.nodes.get(stopId)!;
      const dist = calculateDistance(current.position, stopNode.position);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = stopNode;
      }
    }

    if (nearest) {
      route.push(nearest);
      unvisited.delete(nearest.id);
      current = nearest;
    }
  }

  // Return to start if requested
  if (options.return_to_start) {
    route.push(startNode);
  }

  // 2-opt improvement
  const improvedRoute = twoOpt(route, graph);

  const waypoints = improvedRoute.map((n) => n.position);
  const totalDistance = calculatePathDistance(improvedRoute);
  const estimatedTime = totalDistance / WALKING_SPEED_M_S;

  return {
    path: improvedRoute,
    total_distance: totalDistance,
    estimated_time_seconds: estimatedTime,
    waypoints,
  };
}

/**
 * 2-opt local search improvement for TSP
 */
function twoOpt(route: RouteNode[], graph: VisibilityGraph): RouteNode[] {
  if (route.length < 4) return route;

  let improved = true;
  let bestRoute = [...route];
  let bestDistance = calculatePathDistance(bestRoute);

  while (improved) {
    improved = false;

    for (let i = 1; i < bestRoute.length - 2; i++) {
      for (let j = i + 1; j < bestRoute.length - 1; j++) {
        // Try reversing segment i..j
        const newRoute = [
          ...bestRoute.slice(0, i),
          ...bestRoute.slice(i, j + 1).reverse(),
          ...bestRoute.slice(j + 1),
        ];

        const newDistance = calculatePathDistance(newRoute);
        if (newDistance < bestDistance) {
          bestDistance = newDistance;
          bestRoute = newRoute;
          improved = true;
        }
      }
    }
  }

  return bestRoute;
}

// ============================================================================
// Admin Route Management
// ============================================================================

export interface SpatialRouteOverride {
  id?: string;
  map_id: string;
  from_marker_id: string;
  to_marker_id: string;
  is_blocked: boolean;
  custom_weight?: number | null;
  created_by: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Save admin route override
 */
export async function saveRouteOverride(override: SpatialRouteOverride): Promise<SpatialRouteOverride | null> {
  const { data, error } = await supabase
    .from("spatial_routes")
    .upsert({
      map_id: override.map_id,
      from_marker_id: override.from_marker_id,
      to_marker_id: override.to_marker_id,
      is_blocked: override.is_blocked,
      custom_weight: override.custom_weight,
      created_by: override.created_by,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error("Failed to save route override:", error);
    return null;
  }

  return data;
}

/**
 * Delete admin route override
 */
export async function deleteRouteOverride(mapId: string, fromMarkerId: string, toMarkerId: string): Promise<boolean> {
  const { error } = await supabase
    .from("spatial_routes")
    .delete()
    .eq("map_id", mapId)
    .eq("from_marker_id", fromMarkerId)
    .eq("to_marker_id", toMarkerId);

  return !error;
}

/**
 * Get all route overrides for a map
 */
export async function getRouteOverrides(mapId: string): Promise<SpatialRouteOverride[]> {
  const { data, error } = await supabase
    .from("spatial_routes")
    .select("*")
    .eq("map_id", mapId);

  if (error) {
    console.error("Failed to fetch route overrides:", error);
    return [];
  }

  return data ?? [];
}

// ============================================================================
// Cache Management
// ============================================================================

const graphCache = new Map<string, { graph: VisibilityGraph; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get cached visibility graph or build new one
 */
export async function getCachedVisibilityGraph(mapId: string): Promise<VisibilityGraph> {
  const cached = graphCache.get(mapId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.graph;
  }

  const graph = await buildVisibilityGraph(mapId);
  graphCache.set(mapId, { graph, timestamp: Date.now() });
  return graph;
}

/**
 * Invalidate graph cache for a map
 */
export function invalidateGraphCache(mapId: string): void {
  graphCache.delete(mapId);
}