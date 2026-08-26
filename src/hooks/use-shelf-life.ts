/**
 * Hook for fetching shelf life status for products
 * Used in shelf-scanner to flag planogram observations with date rules
 */

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export type ShelfLifeStatus = {
  sap_article_id: string;
  shelf_lifetime_days: number;
  expiry_date: string;
  arrival_date: string;
  days_remaining: number;
  min_required_days: number;
  is_flagged: boolean;
  compensation_price_ore: number;
};

export type ShelfLifeMap = Record<string, ShelfLifeStatus>;

type UseShelfLifeResult = {
  shelfLifeBySap: ShelfLifeMap;
  isLoading: boolean;
  error: string | null;
};

/**
 * Fetch shelf life status for a list of SAP article IDs.
 * Returns a map keyed by sap_article_id.
 */
export function useShelfLifeForProducts(
  sapArticleIds: string[],
): UseShelfLifeResult {
  const [shelfLifeBySap, setShelfLifeBySap] = useState<ShelfLifeMap>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sapArticleIds || sapArticleIds.length === 0) {
      setShelfLifeBySap({});
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const load = async () => {
      try {
        const { data, error: fnError } = await supabase.functions.invoke(
          "mcp-server",
          {
            body: {
              jsonrpc: "2.0",
              id: "1",
              method: "tools/call",
              params: {
                tool: "get_shelf_life_for_products",
                arguments: { sap_article_ids: sapArticleIds },
              },
            },
          },
        );

        if (fnError) throw fnError;

        // Hantera svar från MCP
        const result = (data as { result?: ShelfLifeStatus[] })?.result ?? [];
        if (cancelled) return;

        const map: ShelfLifeMap = {};
        for (const entry of result) {
          if (entry?.sap_article_id) {
            map[entry.sap_article_id] = entry;
          }
        }
        setShelfLifeBySap(map);
      } catch (e: unknown) {
        if (cancelled) return;
        console.error("useShelfLifeForProducts error:", e);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [sapArticleIds.join("|")]);

  return { shelfLifeBySap, isLoading, error };
}
