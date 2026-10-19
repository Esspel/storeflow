import { supabase } from "./supabase";

export async function fetchAllRows(
  supabaseClient: typeof supabase,
  table: string,
  select: string,
  eq?: { column: string; value: unknown },
  order?: { column: string; ascending?: boolean },
  idColumn = "id",
  batchSize = 1000,
): Promise<any[]> {
  const all: any[] = [];
  let from = 0;
  while (true) {
    let query = supabaseClient
      .from(table)
      .select(select)
      .range(from, from + batchSize - 1);
    if (eq) query = query.eq(eq.column, eq.value);
    if (order) query = query.order(order.column, { ascending: order.ascending ?? false });
    query = query.order(idColumn, { ascending: true });
    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < batchSize) break;
    from += batchSize;
  }
  return all;
}
