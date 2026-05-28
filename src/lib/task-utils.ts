type DeduplicableTask = {
  id: string;
  parent_task_id: string | null;
  recurrence_rule: string | null;
};

/**
 * Keeps one representative per recurring series.
 * For series with children, keeps the first child seen; the parent is dropped.
 * Non-recurring tasks and recurring parents without children pass through unchanged.
 */
export function dedupRecurringSeries<T extends DeduplicableTask>(tasks: T[]): T[] {
  const allParentIds = new Set(
    tasks.filter((t) => t.parent_task_id).map((t) => t.parent_task_id!)
  );
  const parentIdsUsed = new Set<string>();
  return tasks.filter((t) => {
    if (t.parent_task_id) {
      if (parentIdsUsed.has(t.parent_task_id)) return false;
      parentIdsUsed.add(t.parent_task_id);
      return true;
    }
    if (t.recurrence_rule && allParentIds.has(t.id)) return false;
    return true;
  });
}
