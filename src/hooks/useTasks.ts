/**
 * Unified Tasks Hook
 * Merges regular tasks and spatial tasks for unified display in uppgifter.tsx
 */

import { useCallback, useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import type { Task } from "@/lib/supabase";
import { getSpatialTasks, spatialTaskToTask, type SpatialTask } from "@/lib/spatial-tasks";

// Re-export TaskFull from uppgifter for unified usage
export type TaskFull = Task & {
  id: string;
  status: "todo" | "progress" | "done" | "late" | "cancelled";
  steps: { id: string; task_id: string; label: string; is_done: boolean; requires_photo: boolean; sort_order: number; condition_question_id?: string | null; condition_answer?: string | null; link_url?: string | null }[];
  questions: { id: string; task_id: string; label: string; question_type: string; is_required: boolean; answer?: string | null }[];
  store?: { id: string; name: string; address: string | null; phone: string | null; email: string | null; sap_site_id: string | null; created_at: string };
  assignees?: Array<{ user_id: string; user?: { id: string; display_name?: string | null; username?: string | null } | null; group?: { id: string; name: string } | null }>;
  images?: { id: string; task_id: string; storage_path: string; caption: string | null; created_at: string }[];
  event_trigger_description?: string | null;
  event_trigger_user_id?: string | null;
  event_triggered_at?: string | null;
  depends_on_task_id?: string | null;
  delivery_entry_id?: string | null;
  is_critical?: boolean | null;
};

export interface UnifiedTask extends TaskFull {
  /** Identifier for task source: 'regular' | 'spatial' */
  source: "regular" | "spatial";
  /** Original spatial task data (only for spatial tasks) */
  spatial_data?: SpatialTask;
}

/**
 * Fetch all tasks (regular + spatial) for a store
 */
export async function fetchUnifiedTasks(
  storeId: string,
  userStores: Array<{ id: string }>,
  userId: string | null
): Promise<UnifiedTask[]> {
  // Fetch regular tasks
  let regularQuery = supabase
    .from("tasks")
    .select(
      "*, store:stores(*), steps:task_steps(*), questions:task_questions(*), assignees:task_assignees(*, user:app_users(id,display_name,username), group:user_groups(id,name)), images:task_images(*)",
    )
    .order("created_at", { ascending: false })
    .limit(500);

  if (storeId) {
    regularQuery = regularQuery.eq("store_id", storeId);
  } else if (userStores.length > 0) {
    regularQuery = regularQuery.in("store_id", userStores.map((s) => s.id));
  }

  const [{ data: regularData }, spatialData] = await Promise.all([
    regularQuery,
    getSpatialTasks(storeId, { limit: 500 }),
  ]);

  // Convert spatial tasks to Task-compatible format
  const spatialTasks = spatialData.map((st) => ({
    ...spatialTaskToTask(st),
    source: "spatial" as const,
    spatial_data: st,
    steps: [], // Spatial tasks don't have steps currently
    questions: [],
    assignees: st.assignee ? [{ user: st.assignee, group: null }] : [],
    images: [],
    store: undefined,
  }));

  const regularTasks = (regularData ?? []).map((t) => ({
    ...t,
    source: "regular" as const,
    spatial_data: undefined,
  }));

  // Merge and sort by created_at descending
  return [...regularTasks, ...spatialTasks].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

/**
 * Hook for unified task management
 */
export function useUnifiedTasks() {
  const [tasks, setTasks] = useState<UnifiedTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTasks = useCallback(async (storeId: string, userStores: Array<{ id: string }>, userId: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchUnifiedTasks(storeId, userStores, userId);
      setTasks(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fel vid hämtning av uppgifter");
    } finally {
      setLoading(false);
    }
  }, []);

  const addTask = useCallback((task: UnifiedTask) => {
    setTasks((prev) => [task, ...prev]);
  }, []);

  const updateTask = useCallback((id: string, updates: Partial<UnifiedTask>) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updates } : t))
    );
  }, []);

  const removeTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const setTaskStatus = useCallback(async (id: string, status: UnifiedTask["status"], source: "regular" | "spatial") => {
    if (source === "regular") {
      const { error } = await supabase.from("tasks").update({ status: statusMap[status] }).eq("id", id);
      if (error) throw error;
    } else {
      // Use spatial-tasks library
      const { updateSpatialTaskStatus } = await import("@/lib/spatial-tasks");
      await updateSpatialTaskStatus(id, statusMap[status] as any);
    }
    updateTask(id, { status });
  }, [updateTask]);

  return { tasks, loading, error, fetchTasks, addTask, updateTask, removeTask, setTaskStatus };
}

// Map unified status to database status
const statusMap: Record<UnifiedTask["status"], string> = {
  todo: "todo",
  progress: "progress",
  done: "done",
  late: "todo", // late is computed, not stored
  cancelled: "cancelled",
};