import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import type { Marker3DConfig } from "@/lib/three-types";

export function Step4Products({
  storeId,
  markers,
  links: initialLinks,
  onLinksChange,
  onValid,
}: {
  storeId: string;
  markers: Marker3DConfig[];
  links: any[];
  onLinksChange: (links: any[]) => void;
  onValid: () => void;
}) {
  const [productLinks, setProductLinks] = useState<any[]>(initialLinks);
  const [productForm, setProductForm] = useState({
    sap_article_id: "",
    ean: "",
    bnr: "",
    name: "",
  });
  const [loading, setLoading] = useState(false);

  // Load existing links for this store
  useEffect(() => {
    const fetchLinks = async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from("product_links")
          .select("*")
          .eq("store_id", storeId)
          .order("created_at", { ascending: true });
        setProductLinks(data || []);
      } catch (error) {
        console.error("Error loading links:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchLinks();
  }, [storeId]);

  const handleLinkChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setProductForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async () => {
    if (!productForm.sap_article_id || !productForm.ean) {
      toast.error("SAP artikel-ID och EAN är obligatoriska");
      return;
    }

    setLoading(true);
    try {
      // Create new link
      const { error } = await supabase
        .from("product_links")
        .insert({
          store_id: storeId,
          sap_article_id: productForm.sap_article_id,
          ean: productForm.ean,
          bnr: productForm.bnr,
          name: productForm.name,
          created_at: new Date().toISOString(),
        });

      if (error) throw error;

      // Update links state
      onLinksChange([...productLinks, { ...productForm, id: Date.now() }]);

      // Reset form
      setProductForm({
        sap_article_id: "",
        ean: "",
        bnr: "",
        name: "",
      });

      toast.success("Produkt länkad framgångsrikt");
    } catch (error) {
      console.error("Link creation error:", error);
      toast.error("Kunde inte skapa produktlänk");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Steg 4 — Koppla produkter</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-4">
          <Label htmlFor="sap-article-id">SAP Produkt-ID</Label>
          <Input
            id="sap-article-id"
            name="sap_article_id"
            type="text"
            placeholder="T.ex. 1001-23456789"
            value={productForm.sap_article_id}
            onChange={handleLinkChange}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="ean">EAN</Label>
          <Input
            id="ean"
            name="ean"
            type="text"
            placeholder="13-digit EAN"
            value={productForm.ean}
            onChange={handleLinkChange}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="name">Produktnamn</Label>
          <Input
            id="name"
            name="name"
            type="text"
            placeholder="Produktnamn"
            value={productForm.name}
            onChange={handleLinkChange}
            required
          />
        </div>

        <div className="space-y-4">
          <Button
            onClick={handleSubmit}
            disabled={loading || !productForm.sap_article_id || !productForm.ean}
            className="w-full"
          >
            {loading ? "Länkar..." : "Skapa länk"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}