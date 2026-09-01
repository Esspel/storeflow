// Step 4 — Digital Twin 3D: Koppla produkter till sektioner + hyllor
// Använder StoreMap3D som bas + drag/drop från shelf_observations
import "@/lib/three-patches"; // Ensure THREE.Clock available for R3F
import { useState, useEffect, useCallback } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import { StoreMap3D } from "@/components/StoreMap3D";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import type { Section2D } from "@/components/store-map-2d";
import * as THREE from "three";

export function Step4Products({ storeId, markers, links, onLinksChange, onValid }: any) {
  const [sections, setSections] = useState<Section2D[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [draggedProduct, setDraggedProduct] = useState<any>(null);

  useEffect(() => {
    const load = async () => {
      const { data: sec } = await supabase.from("store_sections").select("*").eq("store_id", storeId);
      setSections(sec ?? []);
      const { data: prod } = await supabase.from("products").select("sap_article_id, name, bnr").eq("store_id", storeId);
      setProducts(prod ?? []);
    };
    load();
  }, [storeId]);

  const handleDrop = useCallback((section: Section2D) => {
    if (!draggedProduct) return;
    const link = {
      store_id: storeId,
      sap_article_id: draggedProduct.sap_article_id,
      shelf_marker_id: section.id,
      observed_at: new Date().toISOString(),
    };
    supabase.from("shelf_observations").upsert(link, { onConflict: "store_id,sap_article_id" })
      .then(({ error }) => {
        if (error) throw error;
        toast.success("Produkt kopplad till sektion: " + section.name);
        onLinksChange([...links, link]);
        setDraggedProduct(null);
      });
  }, [draggedProduct, storeId, links, onLinksChange]);

  return (
    <Card>
      <CardHeader><CardTitle>Steg 4 — Digital Twin 3D (drag & drop)</CardTitle></CardHeader>
      <CardContent className="space-y-6">
        <div className="h-[500px] relative">
          <Canvas camera={{ position: [0, 5, 10], fov: 50 }}>
            <ambientLight intensity={0.5} />
            <pointLight position={[10, 10, 10]} />
            <OrbitControls />
            <StoreMap3D markers={markers ?? []} />
          </Canvas>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {products.map(p => (
            <div
              key={p.sap_article_id}
              draggable
              onDragStart={() => setDraggedProduct(p)}
              className="p-2 border rounded bg-coop-gray-100 cursor-grab"
            >
              <Label>{p.name ?? p.sap_article_id}</Label>
              <div className="text-xs text-coop-gray-600">{p.bnr}</div>
            </div>
          ))}
        </div>
        <Button onClick={() => onValid?.()} className="w-full">Slutför</Button>
      </CardContent>
    </Card>
  );
}
