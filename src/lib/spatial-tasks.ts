/**
 * Spatial Tasks Library
 * CRUD operations for spatial_tasks table and conversion to Task-compatible shape
 * for unified display in uppgifter.tsx
 */

import { supabase } from "@/lib/supabase";
import type { Task, AppUser } from "@/lib/supabase";

// ============================================================================
// Types
// ============================================================================

export interface SpatialTask {
  id: string;
  store_id: string;
  anchor_marker_id: string | null;
  title: string;
  description: string | null;
  task_type: "restock" | "price_check" | "planogram_fix" | "cleanup" | "audit" | "other";
  priority: "low" | "medium" | "high" | "urgent";
  assigned_to: string | null;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  due_at: string | null;
  completed_at: string | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined relations
  anchor_marker?: {
    id: string;
    name: string;
    marker_type: string;
    map_id: string;
  } | null;
  assignee?: AppUser | null;
  creator?: AppUser | null;
}

export interface CreateSpatialTaskInput {
  store_id: string;
  anchor_marker_id?: string | null;
  title: string;
  description?: string | null;
  task_type: SpatialTask["task_type"];
  priority?: SpatialTask["priority"];
  assigned_to?: string | null;
  due_at?: string | null;
  metadata?: Record<string, unknown>;
}

export interface UpdateSpatialTaskInput {
  title?: string;
  description?: string | null;
  task_type?: SpatialTask["task_type"];
  priority?: SpatialTask["priority"];
  assigned_to?: string | null;
  status?: SpatialTask["status"];
  due_at?: string | null;
  completed_at?: string | null;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Type Conversion: SpatialTask → Task (for unified UI)
// ============================================================================

const PRIORITY_MAP: Record<SpatialTask["priority"], Task["priority"]> = {
  low: "Låg",
  medium: "Medel",
  high: "Hög",
  urgent: "Kritisk",
};

const STATUS_MAP: Record<SpatialTask["status"], Task["status"]> = {
  pending: "todo",
  in_progress: "progress",
  completed: "done",
  cancelled: "cancelled",
};

const TASK_TYPE_LABELS: Record<SpatialTask["task_type"], string> = {
  restock: "Restock",
  price_check: "Priskoll",
  planogram_fix: "Planogramjustering",
  cleanup: "Städning",
  audit: "Revision",
  other: "Annat",
};

export function spatialTaskToTask(spatialTask: SpatialTask & { anchor_marker?: SpatialTask["anchor_marker"]; assignee?: AppUser | null; creator?: AppUser | null }): Task {
  return {
    id: spatialTask.id,
    title: spatialTask.title,
    description: spatialTask.description ?? "",
    category: TASK_TYPE_LABELS[spatialTask.task_type] ?? "Spatial",
    store_id: spatialTask.store_id,
    assigned_to: spatialTask.assigned_to,
    created_by: spatialTask.created_by,
    priority: PRIORITY_MAP[spatialTask.priority] ?? "Medel",
    status: STATUS_MAP[spatialTask.status] ?? "todo",
    due_date: spatialTask.due_at ? new Date(spatialTask.due_at).toISOString().split("T")[0] : null,
    due_date_time: spatialTask.due_at ?? null,
    recurring: null,
    recurrence_rule: null,
    recurrence_days: null,
    recurrence_interval: null,
    recurrence_start: null,
    recurrence_end: null,
    parent_task_id: null,
    last_spawned_at: null,
    recurrence_period_start: null,
    deleted_periods: null,
    completed_at: spatialTask.completed_at ?? null,
    sap_article_id: null,
    completion_mode: "manual",
    sub_task_order: null,
    process_id: null,
    process_instance_id: null,
    created_at: spatialTask.created_at,
    store: undefined,
    assignee: spatialTask.assignee ?? undefined,
    steps: [],
    questions: [],
    // Custom metadata to identify this as a spatial task
    metadata: {
      ...spatialTask.metadata,
      spatial_task_id: spatialTask.id,
      spatial_task_type: spatialTask.task_type,
      anchor_marker_id: spatialTask.anchor_marker_id,
      anchor_marker_name: spatialTask.anchor_marker?.name ?? null,
    } as Record<string, unknown>,
  };
}

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Fetch all spatial tasks for a store, optionally filtered
 */
export async function getSpatialTasks(
  storeId: string,
  options?: {
    status?: SpatialTask["status"] | SpatialTask["status"][];
    task_type?: SpatialTask["task_type"] | SpatialTask["task_type"][];
    assigned_to?: string;
    anchor_marker_id?: string;
    limit?: number;
  }
): Promise<SpatialTask[]> {
  let query = supabase
    .from("spatial_tasks")
    .select(`
      *,
      anchor_marker:spatial_markers!anchor_marker_id(id, name, marker_type, map_id),
      assignee:app_users!assigned_to(id, full_name, email, avatar_url, role),
      creator:app_users!created_by(id, full_name, email, avatar_url, role)
    `)
    .eq("store_id", storeId)
    .order("created_at", { ascending: false });

  if (options?.status) {
    const statuses = Array.isArray(options.status) ? options.status : [options.status];
    query = query.in("status", statuses);
  }
  if (options?.task_type) {
    const types = Array.isArray(options.task_type) ? options.task_type : [options.task_type];
    query = query.in("task_type", types);
  }
  if (options?.assigned_to) {
    query = query.eq("assigned_to", options.assigned_to);
  }
  if (options?.anchor_marker_id) {
    query = query.eq("anchor_marker_id", options.anchor_marker_id);
  }
  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as SpatialTask[];
}

/**
 * Get a single spatial task by ID
 */
export async function getSpatialTask(id: string): Promise<SpatialTask | null> {
  const { data, error } = await supabase
    .from("spatial_tasks")
    .select(`
      *,
      anchor_marker:spatial_markers!anchor_marker_id(id, name, marker_type, map_id),
      assignee:app_users!assigned_to(id, full_name, email, avatar_url, role),
      creator:app_users!created_by(id, full_name, email, avatar_url, role)
    `)
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // Not found
    throw error;
  }
  return data as SpatialTask;
}

/**
 * Create a new spatial task
 */
export async function createSpatialTask(input: CreateSpatialTaskInput): Promise<SpatialTask> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;

  const { data, error } = await supabase
    .from("spatial_tasks")
    .insert({
      ...input,
      created_by: userId,
      updated_by: userId,
    })
    .select(`
      *,
      anchor_marker:spatial_markers!anchor_marker_id(id, name, marker_type, map_id),
      assignee:app_users!assigned_to(id, full_name, email, avatar_url, role),
      creator:app_users!created_by(id, full_name, email, avatar_url, role)
    `)
    .single();

  if (error) throw error;
  return data as SpatialTask;
}

/**
 * Update a spatial task
 */
export async function updateSpatialTask(id: string, input: UpdateSpatialTaskInput): Promise<SpatialTask> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;

  const { data, error } = await supabase
    .from("spatial_tasks")
    .update({
      ...input,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(`
      *,
      anchor_marker:spatial_markers!anchor_marker_id(id, name, marker_type, map_id),
      assignee:app_users!assigned_to(id, full_name, email, avatar_url, role),
      creator:app_users!created_by(id, full_name, email, avatar_url, role)
    `)
    .single();

  if (error) throw error;
  return data as SpatialTask;
}

/**
 * Delete a spatial task
 */
export async function deleteSpatialTask(id: string): Promise<void> {
  const { error } = await supabase.from("spatial_tasks").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Update task status (convenience method)
 */
export async function updateSpatialTaskStatus(
  id: string,
  status: SpatialTask["status"]
): Promise<SpatialTask> {
  const updates: UpdateSpatialTaskInput = { status };
  if (status === "completed") {
    updates.completed_at = new Date().toISOString();
  }
  return updateSpatialTask(id, updates);
}

/**
 * Assign task to user
 */
export async function assignSpatialTask(id: string, assignedTo: string | null): Promise<SpatialTask> {
  return updateSpatialTask(id, { assigned_to: assignedTo });
}

/**
 * Get spatial tasks grouped by anchor marker (for shift handover view)
 */
export async function getSpatialTasksByMarker(storeId: string): Promise<
  Array<{
    marker: { id: string; name: string; marker_type: string } | null;
    tasks: SpatialTask[];
  }>
> {
  const tasks = await getSpatialTasks(storeId);

  const grouped = new Map<string, SpatialTask[]>();
  for (const task of tasks) {
    const key = task.anchor_marker_id ?? "unassigned";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(task);
  }

  return Array.from(grouped.entries()).map(([markerId, tasks]) => ({
    marker: tasks[0]?.anchor_marker ?? null,
    tasks,
  }));
}

/**
 * Get spatial task statistics for a store
 */
export async function getSpatialTaskStats(storeId: string): Promise<{
  total: number;
  pending: number;
  in_progress: number;
  completed: number;
  by_type: Record<SpatialTask["task_type"], number>;
}> {
  const tasks = await getSpatialTasks(storeId);

  const stats = {
    total: tasks.length,
    pending: 0,
    in_progress: 0,
    completed: 0,
    by_type: {
      restock: 0,
      price_check: 0,
      planogram_fix: 0,
      cleanup: 0,
      audit: 0,
      other: 0,
    } as Record<SpatialTask["task_type"], number>,
  };

  for (const task of tasks) {
    if (task.status === "pending") stats.pending++;
    else if (task.status === "in_progress") stats.in_progress++;
    else if (task.status === "completed") stats.completed++;
    stats.by_type[task.task_type]++;
  }

  return stats;
}

/**
 * Create spatial task from shelf scanner deviation
 */
export async function createSpatialTaskFromDeviation(
  storeId: string,
  anchorMarkerId: string,
  deviation: {
    type: "missing_product" | "wrong_position" | "extra_product";
    productName: string;
    ean?: string;
    expectedPosition?: { x: number; y: number; z: number };
    actualPosition?: { x: number; y: number; z: number };
  }
): Promise<SpatialTask> {
  const typeMap: Record<typeof deviation.type, SpatialTask["task_type"]> = {
    missing_product: "restock",
    wrong_position: "planogram_fix",
    extra_product: "cleanup",
  };

  return createSpatialTask({
    store_id: storeId,
    anchor_marker_id: anchorMarkerId,
    title: `${TASK_TYPE_LABELS[typeMap[deviation.type]]}: ${deviation.productName}`,
    description: `Avvikelse upptägen vid skanning: ${deviation.type === "missing_product" ? "Produkt saknas" : deviation.type === "wrong_position" ? "Fel position" : "Extra produkt"}${deviation.ean ? ` (EAN: ${deviation.ean})` : ""}`,
    task_type: typeMap[deviation.type],
    priority: deviation.type === "missing_product" ? "high" : "medium",
    metadata: {
      deviation_type: deviation.type,
      product_name: deviation.productName,
      ean: deviation.ean ?? null,
      expected_position: deviation.expectedPosition ?? null,
      actual_position: deviation.actualPosition ?? null,
      source: "shelf_scan",
    },
  });
}