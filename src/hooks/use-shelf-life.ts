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
export function useShelfLifeForProducts(sapArticleIds: string[]): UseShelfLifeResult {
  const [shelfLifeBySap, setShelfLifeBySap] = useState<ShelfLifeMap>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sapArticleIds || sapArticleIds.length === 0) {
      setShelfLifeBySap({});
      return;
    }

    let isCancelled = false;
    setIsLoading(true);
    setError(null);

    const load = async () => {
      try {
        // Direct DB query instead of MCP API endpoint
        const { data, error: dbError } = await supabase
          .from("shelf_life")
          .select("sap_article_id,shelf_lifetime_days,expiry_date,arrival_date")
          .in("sap_article_id", sapArticleIds);

        if (dbError) throw dbError;

        const result = (data ?? []) as ShelfLifeStatus[];
        if (!isCancelled) {
          const map: ShelfLifeMap = {};
          for (const entry of result) {
            if (entry?.sap_article_id) {
              // Calculate derived fields
              const now = new Date();
              const exp = new Date(entry.expiry_date);
              const daysRemaining = Math.ceil(
                (exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
              );
              map[entry.sap_article_id] = {
                ...entry,
                days_remaining: daysRemaining,
                min_required_days: 7,
                is_flagged: daysRemaining < 7,
                compensation_price_ore: 0,
              };
            }
          }
          setShelfLifeBySap(map);
        }
      } catch (e) {
        if (!isCancelled) setError((e as Error)?.message ?? String(e));
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    };

    load();
    return () => {
      isCancelled = true;
    };
  }, [JSON.stringify(sapArticleIds?.sort())]);

  return { shelfLifeBySap, isLoading, error };
}
