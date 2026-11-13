import { supabase } from "./supabase";

export async function fetchAllRows(
  supabaseClient: typeof supabase,
  table: string,
  select: string,
  eq?: { column: string; value: unknown } | { column: string; value: unknown }[],
  order?: { column: string; ascending?: boolean },
  idColumn = "id",
  batchSize = 1000,
): Promise<any[]> {
  const all: any[] = [];
  let lastCursor: { orderValue: unknown; id: unknown } | null = null;
  const isAscending = order?.ascending ?? false;
  const orderColumn = order?.column ?? idColumn;

  const eqFilters = eq ? (Array.isArray(eq) ? eq : [eq]) : [];

  // Ensure select includes idColumn and orderColumn for cursor pagination
  const selectColumns = select.split(",").map((c) => c.trim());
  const requiredColumns = new Set([idColumn, orderColumn]);
  for (const col of requiredColumns) {
    if (!selectColumns.some((c) => c === col || c.startsWith(`${col}(`))) {
      selectColumns.push(col);
    }
  }
  const selectWithCursor = selectColumns.join(",");

  while (true) {
    let query = supabaseClient.from(table).select(selectWithCursor).limit(batchSize);

    for (const f of eqFilters) {
      query = query.eq(f.column, f.value);
    }

    // Apply cursor-based pagination
    if (lastCursor) {
      const { orderValue, id } = lastCursor;
      if (isAscending) {
        query = query.or(
          `${orderColumn}.gt.${orderValue},and(${orderColumn}.eq.${orderValue},${idColumn}.gt.${id})`,
        );
      } else {
        query = query.or(
          `${orderColumn}.lt.${orderValue},and(${orderColumn}.eq.${orderValue},${idColumn}.gt.${id})`,
        );
      }
    }

    // Apply deterministic ordering
    query = query.order(orderColumn, { ascending: isAscending });
    query = query.order(idColumn, { ascending: true });

    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) break;

    all.push(...data);

    // Update cursor for next iteration
    const lastRow = data[data.length - 1];
    lastCursor = {
      orderValue: lastRow[orderColumn],
      id: lastRow[idColumn],
    };

    if (data.length < batchSize) break;
  }

  return all;
}