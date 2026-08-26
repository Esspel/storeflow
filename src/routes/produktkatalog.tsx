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
import { getProductReclamationStats } from "@/lib/mcp";
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
    // Använd butiks-ID från auth om inget angivits
    const id = selectedStoreId || activeStore?.id;
    if (!id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    getProductReclamationStats(id)
      .then((result) => {
        setProducts(result || []);
        setLoading(false);
      })
      .catch((e: Error) => {
        console.error("Failed to load product stats:", e);
        setError(e.message);
        setLoading(false);
        toast.error("Kunde inte ladda produktkatalog");
      });
  }, [selectedStoreId, activeStore?.id]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent"></div>
        <p className="mt-2 text-center text-foreground">Laddar produktkatalog...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-500/10 text-red-200 rounded-lg border border-red-500">
        <p className="font-medium">Fel: {error}</p>
      </div>
    );
  }

  return (
    <div className="p-4 bg-slate-950 min-h-screen">
      <h1 className="text-2xl font-semibold mb-4">Produktkatalog med reklamationshistorik</h1>

      {/* Filtrera-butik om fler butiker finns */}
      {storeId ? null : (
        <div className="mb-4">
          <Label className="block mb-1 text-sm">Butik</Label>
          <Select onValueChange={(val) => setSelectedStoreId(val as string)}>
            <SelectTrigger>
              <SelectValue placeholder="Välj butik" />
            </SelectTrigger>
            <SelectContent>
              {storeId ? (
                <SelectItem value={storeId} disabled>Nuvarande butik</SelectItem>
              ) : null}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Tabell över produkter */}
      {products.length === 0 ? (
        <p className="text-slate-400 text-center py-8">Inga produkter hittades för den valda butiken.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell className="text-left">SAP-ID</TableCell>
                <TableCell className="text-left">Produktnamn</TableCell>
                <TableCell className="text-left">EAN</TableCell>
                <TableCell className="text-left">BNR</TableCell>
                <TableCell>Reklamationer</TableCell>
                <TableCell>Leveranser</TableCell>
                <TableCell>Senaste reklamation</TableCell>
                <TableCell>Senaste leverans</TableCell>
                <TableCell></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {products.map((product) => (
                <TableRow key={product.sap_article_id} className="border-b last:border-0">
                  <TableCell>{product.sap_article_id}</TableCell>
                  <TableCell>{product.name}</TableCell>
                  <TableCell>{product.ean || "-"}</TableCell>
                  <TableCell>{product.bnr || "-"}</TableCell>
                  <TableCell className="text-center">{product.reclamation_count}</TableCell>
                  <TableCell className="text-center">{product.delivery_count}</TableCell>
                  <TableCell>{product.last_reclamation_reason ? "(" + product.last_reclamation_reason.substring(0, 30) + ")" : "-"}</TableCell>
                  <TableCell>{product.last_delivery || "-"}</TableCell>
                  <TableCell>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-emerald-400"
                      onClick={() => {
                        // Kopiera SAP-ID till urklipp
                        navigator.clipboard.writeText(product.sap_article_id);
                        toast.success("SAP-ID kopierat: " + product.sap_article_id);
                      }}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}