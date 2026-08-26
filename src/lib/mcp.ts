/**
 * MCP Client Library
 * Client-side wrappers for calling MCP server tools
 */

import { supabase, _sessionToken } from "@/lib/supabase";
import type { ShelfLifeStatus } from "@/hooks/use-shelf-life";

/**
 * Invoke an MCP tool via the mcp-server edge function
 */
async function invokeTool<T = unknown>(
  tool: string,
  args: Record<string, unknown>
): Promise<T> {
  // Use session token if available (logged-in user), otherwise anon key
  const token = _sessionToken || import.meta.env.VITE_SUPABASE_ANON_KEY || "anon";
  const { data, error } = await supabase.functions.invoke("mcp-server", {
    body: {
      jsonrpc: "2.0",
      id: "1",
      method: "tools/call",
      params: {
        tool,
        arguments: args,
      },
    },
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (error) throw new Error(error.message || "MCP tool invocation failed");

  // MCP response format: { content: [{ type: "text", text: JSON_STRING }] }
  const result = (data as { content?: Array<{ text: string }> })?.content?.[0]?.text;
  if (!result) return data as T;

  try {
    const parsed = JSON.parse(result);
    if (parsed.isError) throw new Error(parsed.message || "Tool execution failed");
    return parsed as T;
  } catch {
    return result as unknown as T;
  }
}

/**
 * Get shelf life data for multiple products
 */
export async function getShelfLifeForProducts(
  sapArticleIds: string[]
): Promise<Record<string, ShelfLifeStatus>> {
  const result = await invokeTool<Record<string, ShelfLifeStatus>>(
    "get_shelf_life_for_products",
    { sap_article_ids: sapArticleIds }
  );
  return result;
}

/**
 * Set shelf life for a product
 */
export async function setShelfLife(data: {
  sap_article_id: string;
  shelf_lifetime_days: number;
  expiry_date: string;
  arrival_date: string;
  compensation_price_ore?: number;
}): Promise<{ success: boolean }> {
  return invokeTool<{ success: boolean }>("set_shelf_life", data);
}

/**
 * Generate shelf life zip file
 */
export async function generateShelfLifeZip(
  storeId?: string
): Promise<{ csv_data: string; flagged_count: number; total_checked: number }> {
  return invokeTool("generate_shelf_life_zip", { store_id: storeId });
}

/**
 * Group flagged products by delivery number and temperature zone
 */
export async function groupShelfLifeByDelivery(
  storeId: string
): Promise<{
  groups: Record<string, { csv: string; count: number }>;
  total_flagged: number;
}> {
  return invokeTool("group_shelf_life_by_delivery", { store_id: storeId });
}

/**
 * Get product reclamation statistics
 */
export type ProductReclamationStats = {
  sap_article_id: string;
  name: string;
  ean: string;
  bnr: string;
  reclamation_count: number;
  delivery_count: number;
  last_reclamation: string | null;
  last_reclamation_reason: string | null;
  last_delivery: string | null;
};

export async function getProductReclamationStats(
  storeId?: string,
  sapArticleId?: string
): Promise<ProductReclamationStats[]> {
  return invokeTool<ProductReclamationStats[]>("get_product_reclamation_stats", {
    store_id: storeId,
    sap_article_id: sapArticleId,
  });
}
