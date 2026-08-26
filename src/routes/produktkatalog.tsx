/**
 * Produktkatalog Route
 * Visar produktlista med reklamationshistorik
 */

import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

type ProductStats = {
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

type ProduktkatalogProps = {
  storeId?: string;
};

export const Route = createFileRoute("/produktkatalog")({
  component: ProduktkatalogPage,
});

function ProduktkatalogPage() {
  const { activeStore } = useAuth();
  const [products, setProducts] = useState<ProductStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState<string | undefined>(activeStore?.id);

  useEffect(() => {
    const id = selectedStoreId || activeStore?.id;
    if (!id) {
      setLoading(false);
      return;
    }

    let isCancelled = false;
    setLoading(true);
    setError(null);

    // Direct DB query instead of MCP API call
    supabase
      .from("product_reclamation_stats")
      .select("sap_article_id, name, ean, bnr, reclamation_count, delivery_count, last_reclamation, last_reclamation_reason, last_delivery")
      .eq("store_id", id)
      .order("reclamation_count", { ascending: false })
      .then(({ data, error: dbErr }) => {
        if (isCancelled) return;
        if (dbErr) {
          setError(dbErr.message);
          toast.error("Kunde inte ladda produktkatalog");
        } else {
          setProducts((data ?? []) as ProductStats[]);
        }
        setLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [selectedStoreId, activeStore?.id]);
}
