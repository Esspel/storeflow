import { supabase } from "@/lib/supabase";
import type { AukiPosemeshNetwork } from "@/lib/posemesh/auki-network";
import type { SpatialMap } from "@/types/digital-twin";

interface ComplianceData {
  score: number;
  missing: number;
  misplaced: number;
  extra: number;
}

export class ArDomainService {
  constructor(
    private network: AukiPosemeshNetwork,
    private supabaseClient = supabase
  ) {}

  async loadStoreData(storeId: string): Promise<[SpatialMap | null, ComplianceData | null]> {
    try {
      // Load domain data from Auki network
      const domain = await this.network.getDomain(storeId);
      if (!domain) {
        return [null, null];
      }

      // Load compliance data from Supabase
      const { data, error } = await this.supabaseClient
        .from("shelf_observations")
        .select("*")
        .eq("store_id", storeId)
        .eq("capture_method", "camera")
        .order("captured_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("Failed to load compliance data:", error);
        return [domain, null]; // Return domain but no compliance
      }

      // Calculate compliance score
      const compliance: ComplianceData = {
        score: data?.compliance_score ?? 0,
        missing: data?.missing_products?.length ?? 0,
        misplaced: data?.misplaced_products?.length ?? 0,
        extra: data?.extra_products?.length ?? 0,
      };

      return [domain, compliance];
    } catch (err) {
      console.error("Failed to load store data for AR:", err);
      return [null, null]; // Offline or network error
    }
  }

  async getActiveProducts(storeId: string): Promise<string[]> {
    const { data } = await this.supabaseClient
      .from("shelf_planograms")
      .select("expected_products")
      .eq("store_id", storeId)
      .eq("is_active", true)
      .single();

    if (!data?.expected_products) return [];

    // Return unique product IDs from planogram
    return Array.from(
      new Set(
        (data.expected_products as any[])
          .filter(item => item.product_id)
          .map(item => item.product_id)
      )
    );
  }
}