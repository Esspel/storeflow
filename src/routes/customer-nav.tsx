/**
 * Customer Navigation Route
 * Public route - no authentication required
 * Accessible via QR code at store entrance
 */

import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  Search,
  Navigation,
  MapPin,
  ArrowUpRight,
  Home,
  ShoppingCart,
  CheckCircle,
  XCircle,
  ArrowLeft,
  QrCode,
  Store,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { lookupCoopProductByEan, searchCoopProducts, type CoopProduct, MOCK_COOP_PRODUCTS } from "@/lib/coop-products";

interface SpatialMarker {
  id: string;
  name: string;
  type: "shelf" | "product" | "zone" | "entrance" | "exit" | "aisle";
  position: { x: number; y: number; z: number };
  metadata?: Record<string, unknown>;
}

interface SpatialMap {
  id: string;
  store_id: string;
  name: string;
  markers: SpatialMarker[];
  routes?: Array<{ from: string; to: string; distance: number }>;
}

function CustomerNavPage() {
  const [storeId, setStoreId] = useState<string | null>(null);
  const [map, setMap] = useState<SpatialMap | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CoopProduct[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<CoopProduct | null>(null);
  const [selectedMarker, setSelectedMarker] = useState<SpatialMarker | null>(null);
  const [viewMode, setViewMode] = useState<"search" | "map" | "ar">("search");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check for store ID in URL params (from entrance QR code)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const store = params.get("store");
    if (store) {
      setStoreId(store);
      loadMap(store);
    }
  }, []);

  const loadMap = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from("spatial_maps")
        .select("*")
        .eq("store_id", id)
        .maybeSingle();

      if (err) throw err;
      if (data) {
        setMap(data as SpatialMap);
        setViewMode("map");
      } else {
        setError("Hittade ingen butikskarta för denna butik");
      }
    } catch (err) {
      console.error("Failed to load map:", err);
      setError("Kunde inte ladda butikskarta");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    setLoading(true);
    try {
      const results = await searchCoopProducts(query);
      setSearchResults(results);
    } catch (err) {
      console.error("Search failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleProductSelect = (product: CoopProduct) => {
    setSelectedProduct(product);
    // Find marker for this product
    if (map) {
      const marker = map.markers.find(
        (m) => m.metadata?.ean === product.ean || m.metadata?.bnr === product.bnr || m.name.toLowerCase().includes(product.name.toLowerCase())
      );
      if (marker) {
        setSelectedMarker(marker);
        setViewMode("ar");
      }
    }
    setSearchQuery("");
    setSearchResults([]);
  };

  const handleBarcodeScan = async (ean: string) => {
    setLoading(true);
    try {
      const product = await lookupCoopProductByEan(ean);
      if (product) {
        // Find full product info
        const fullProduct = MOCK_COOP_PRODUCTS.find((p: CoopProduct) => p.ean === ean);
        if (fullProduct) handleProductSelect(fullProduct);
      } else {
        setError(`Hittade ingen produkt med EAN: ${ean}`);
      }
    } catch (err) {
      console.error("Barcode lookup failed:", err);
      setError("Kunde inte söka upp produkt");
    } finally {
      setLoading(false);
    }
  };

  // Simulated camera scan - in real app would use usePosemeshDetection
  const simulateScan = () => {
    // Demo EAN codes
    const demoEans = ["7310663010014", "7310663010045", "7391771001001", "7310654001002"];
    const randomEan = demoEans[Math.floor(Math.random() * demoEans.length)];
    handleBarcodeScan(randomEan);
  };

  const typeColors = {
    shelf: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    product: "bg-green-500/20 text-green-300 border-green-500/30",
    zone: "bg-purple-500/20 text-purple-300 border-purple-500/30",
    entrance: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    exit: "bg-rose-500/20 text-rose-300 border-rose-500/30",
    aisle: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  };

  const typeLabels = {
    shelf: "Hylla",
    product: "Produkt",
    zone: "Zon",
    entrance: "Ingång",
    exit: "Utgång",
    aisle: "Gång",
  };

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-card/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 w-full max-w-[1400px] items-center gap-3 px-4 md:h-16 md:gap-4 md:px-8">
          <div className="flex shrink-0 items-center gap-2">
            <div className="flex flex-col leading-none">
              <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Store</span>
              <span className="text-2xl font-black tracking-tight text-primary">Flow</span>
            </div>
          </div>
          <div className="flex-1" />
          {storeId && (
            <Badge className="gap-1.5 bg-indigo-500/20 text-indigo-300 border-indigo-500/30">
              <Store className="w-3 h-3" />
              {map?.name || "Butik"}
            </Badge>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-6 md:px-8 md:py-8">
        {/* Store Selection (if no store selected) */}
        {!storeId && (
          <div className="max-w-md mx-auto text-center space-y-6">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-md)]">
              <QrCode className="h-8 w-8" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Välkommen till StoreFlow kundnavigering
            </h1>
            <p className="text-slate-500 dark:text-slate-400">
              Skanna QR-koden vid butikens ingång eller välj butik nedan för att börja navigera.
            </p>

            <div className="space-y-3">
              <Button className="w-full gap-2 bg-indigo-600 hover:bg-indigo-500 text-white" onClick={simulateScan}>
                <Navigation className="w-4 h-4" />
                Demo: Simulera QR-skanning (Butik 1)
              </Button>
              <Button className="w-full gap-2" variant="outline" onClick={() => setStoreId("demo-store-1")}>
                <MapPin className="w-4 h-4" />
                Välj butik manuellt
              </Button>
            </div>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Demo-butik: "demo-store-1" (Coop Mörby Centrum)
              </p>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && storeId && (
          <div className="max-w-md mx-auto mb-6 p-4 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800">
            <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
              <XCircle className="w-5 h-5" />
              <span>{error}</span>
            </div>
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => { setStoreId(null); setMap(null); setError(null); }}>
              <ArrowLeft className="w-4 h-4 mr-1" />
              Byt butik
            </Button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center min-h-[300px]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-500 border-t-transparent mx-auto mb-4" />
              <p className="text-slate-600 dark:text-slate-400">Laddar butikskarta...</p>
            </div>
          </div>
        )}

        {/* Main Navigation UI */}
        {storeId && map && !loading && (
          <div className="space-y-6">
            {/* View Mode Tabs */}
            <div className="flex items-center gap-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-2 max-w-md">
              <Button
                variant={viewMode === "search" ? "default" : "ghost"}
                size="sm"
                className="gap-1.5 flex-1"
                onClick={() => setViewMode("search")}
              >
                <Search className="w-4 h-4" />
                <span className="hidden sm:inline">Sök</span>
              </Button>
              <Button
                variant={viewMode === "map" ? "default" : "ghost"}
                size="sm"
                className="gap-1.5 flex-1"
                onClick={() => setViewMode("map")}
              >
                <MapPin className="w-4 h-4" />
                <span className="hidden sm:inline">Karta</span>
              </Button>
              <Button
                variant={viewMode === "ar" ? "default" : "ghost"}
                size="sm"
                className="gap-1.5 flex-1"
                onClick={() => setViewMode("ar")}
                disabled={!selectedMarker}
              >
                <Navigation className="w-4 h-4" />
                <span className="hidden sm:inline">AR</span>
              </Button>
            </div>

            {/* Search View */}
            {viewMode === "search" && (
              <div className="max-w-md mx-auto space-y-4">
                <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Search className="w-5 h-5 text-indigo-500" />
                      Hitta produkt
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input
                        placeholder="Sök produkt, EAN eller BNR..."
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          handleSearch(e.target.value);
                        }}
                        className="pl-10"
                        autoFocus
                      />
                    </div>

                    <Button
                      variant="outline"
                      className="w-full gap-2"
                      onClick={simulateScan}
                      disabled={loading}
                    >
                      <QrCode className="w-4 h-4" />
                      Skanna streckkod (demo)
                    </Button>

                    {searchResults.length > 0 && (
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {searchResults.map((product) => (
                          <Button
                            key={product.ean || product.bnr || product.name}
                            variant="outline"
                            className="w-full justify-start gap-3 text-left p-3"
                            onClick={() => handleProductSelect(product)}
                          >
                            <div className="flex-1 text-left">
                              <p className="font-medium text-slate-900 dark:text-slate-100">{product.name}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                {product.brand && <span>{product.brand}</span>}
                                {product.size && <span>• {product.size}</span>}
                                {product.ean && <span>• EAN: {product.ean}</span>}
                                {product.bnr && <span>• BNR: {product.bnr}</span>}
                              </p>
                            </div>
                            <ArrowUpRight className="w-4 h-4 text-slate-400" />
                          </Button>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Quick Categories */}
                <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-sm font-medium text-slate-900 dark:text-slate-100">Populära kategorier</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {["Kaffe", "Mjölk", "Bröd", "Frukt", "Grönsaker", "Mejeri", "Kött", "Fisk", "Frusen", "Snacks"].map((cat) => (
                        <Button
                          key={cat}
                          variant="ghost"
                          size="sm"
                          className="gap-1"
                          onClick={() => handleSearch(cat)}
                        >
                          <ShoppingCart className="w-3.5 h-3.5" />
                          {cat}
                        </Button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Map View */}
            {viewMode === "map" && (
              <div className="space-y-4">
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden aspect-[4/3] md:aspect-[16/9]">
                  <CustomerMapView
                    map={map}
                    selectedMarker={selectedMarker}
                    onMarkerClick={setSelectedMarker}
                  />
                </div>

                {/* Legend */}
                <div className="flex flex-wrap gap-3 justify-center">
                  {["entrance", "shelf", "product", "zone", "aisle", "exit"].map((type) => (
                    <Badge key={type} variant="outline" className={cn("gap-1", typeColors[type as keyof typeof typeColors])}>
                      <span className="w-3 h-3 rounded-full bg-current" />
                      {typeLabels[type as keyof typeof typeLabels]}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* AR View */}
            {viewMode === "ar" && (
              <div className="space-y-4">
                <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden aspect-[4/3] md:aspect-[16/9] relative">
                  <div className="absolute inset-0 flex items-center justify-center text-white">
                    <div className="text-center p-8">
                      <Navigation className="w-16 h-16 mx-auto mb-4 opacity-50" />
                      <h3 className="text-lg font-medium mb-2">AR-navigering</h3>
                      <p className="text-slate-400 mb-4 max-w-xs mx-auto">
                        Kameravyn med AR-pilar visas här. Peka kameran mot hyllmarkörer för att navigera.
                      </p>
                      {selectedMarker && (
                        <div className="bg-slate-900/50 rounded-lg p-4 max-w-xs mx-auto text-left">
                          <p className="font-medium">Navigerar till:</p>
                          <p className="text-indigo-300">{selectedMarker.name}</p>
                          <p className="text-xs text-slate-400 capitalize mt-1">{typeLabels[selectedMarker.type]}</p>
                        </div>
                      )}
                      {selectedProduct && (
                        <div className="mt-4 bg-emerald-900/30 rounded-lg p-3 max-w-xs mx-auto text-left border border-emerald-500/30">
                          <p className="font-medium text-emerald-300 flex items-center gap-1">
                            <CheckCircle className="w-4 h-4" />
                            Produkt hittad!
                          </p>
                          <p className="text-sm">{selectedProduct.name}</p>
                          <p className="text-xs text-slate-400">{selectedProduct.size} • {selectedProduct.price ? `${selectedProduct.price} kr` : ""}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {selectedProduct && (
                  <Card className="bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 max-w-md mx-auto">
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                        <CheckCircle className="w-5 h-5" />
                        Produkt hittad
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center">
                          <ShoppingCart className="w-8 h-8 text-slate-400" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-900 dark:text-slate-100">{selectedProduct.name}</p>
                          <p className="text-sm text-slate-500 dark:text-slate-400">{selectedProduct.brand} • {selectedProduct.size}</p>
                          {selectedProduct.price && (
                            <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{selectedProduct.price} kr</p>
                          )}
                        </div>
                      </div>
                      {selectedProduct.productUrl && (
                        <a
                          href={selectedProduct.productUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full"
                        >
                          <Button variant="outline" className="w-full gap-2">
                            <ArrowUpRight className="w-4 h-4" />
                            Visa i Coop sortiment
                          </Button>
                        </a>
                      )}
                    </CardContent>
                  </Card>
                )}

                {selectedMarker && !selectedProduct && (
                  <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 max-w-md mx-auto">
                    <CardContent className="pt-0">
                      <Button className="w-full gap-2" variant="outline" onClick={() => { setSelectedMarker(null); setViewMode("map"); }}>
                        <ArrowLeft className="w-4 h-4" />
                        Tillbaka till karta
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Bottom hint */}
      {storeId && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 md:hidden">
          <Button
            variant="secondary"
            className="gap-2 rounded-full shadow-lg"
            onClick={() => setViewMode(viewMode === "ar" ? "map" : "ar")}
          >
            <Navigation className="w-4 h-4" />
            {viewMode === "ar" ? "Visa karta" : "Starta AR"}
          </Button>
        </div>
      )}
    </div>
  );
}

// Customer Map View (simplified 2D map)
function CustomerMapView({
  map,
  selectedMarker,
  onMarkerClick,
}: {
  map: SpatialMap;
  selectedMarker: SpatialMarker | null;
  onMarkerClick: (marker: SpatialMarker) => void;
}) {
  const bounds = map.markers.reduce(
    (acc, m) => ({
      minX: Math.min(acc.minX, m.position.x),
      maxX: Math.max(acc.maxX, m.position.x),
      minY: Math.min(acc.minY, m.position.y),
      maxY: Math.max(acc.maxY, m.position.y),
    }),
    { minX: 0, maxX: 20, minY: 0, maxY: 20 },
  );

  const width = bounds.maxX - bounds.minX || 20;
  const height = bounds.maxY - bounds.minY || 20;
  const scale = Math.min(800 / width, 600 / height) * 0.8;
  const offsetX = (800 - width * scale) / 2 - bounds.minX * scale;
  const offsetY = (600 - height * scale) / 2 - bounds.minY * scale;

  const typeColors = {
    shelf: "#3b82f6",
    product: "#22c55e",
    zone: "#a855f7",
    entrance: "#10b981",
    exit: "#f43f5e",
    aisle: "#f59e0b",
  };

  const typeIcons = {
    shelf: "📦",
    product: "🛍️",
    zone: "📍",
    entrance: "🚪",
    exit: "🚪",
    aisle: "🛤️",
  };

  return (
    <svg viewBox="0 0 800 600" className="w-full h-full" style={{ background: "#f8fafc" }}>
      <defs>
        <marker
          id="arrowhead"
          markerWidth="10"
          markerHeight="7"
          refX="9"
          refY="3.5"
          orient="auto"
        >
          <polygon points="0 0, 10 3.5, 0 7" fill="#94a3b8" />
        </marker>
      </defs>
      {/* Routes */}
      {map.routes?.map((route, i) => {
        const from = map.markers.find((m) => m.id === route.from);
        const to = map.markers.find((m) => m.id === route.to);
        if (!from || !to) return null;
        const x1 = from.position.x * scale + offsetX;
        const y1 = from.position.y * scale + offsetY;
        const x2 = to.position.x * scale + offsetX;
        const y2 = to.position.y * scale + offsetY;
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="#94a3b8"
            strokeWidth="2"
            strokeDasharray="5,5"
            markerEnd="url(#arrowhead)"
          />
        );
      })}
      {/* Markers */}
      {map.markers.map((marker) => {
        const x = marker.position.x * scale + offsetX;
        const y = marker.position.y * scale + offsetY;
        const isSelected = selectedMarker?.id === marker.id;
        return (
          <g
            key={marker.id}
            onClick={() => onMarkerClick(marker)}
            style={{ cursor: "pointer" }}
          >
            <circle
              cx={x}
              cy={y}
              r={isSelected ? 16 : 12}
              fill={typeColors[marker.type]}
              opacity={isSelected ? 1 : 0.85}
              stroke={isSelected ? "#4f46e5" : "white"}
              strokeWidth={isSelected ? 3 : 2}
              filter="drop-shadow(0 2px 4px rgba(0,0,0,0.1))"
            />
            <text
              x={x}
              y={y + 4}
              textAnchor="middle"
              fontSize="16"
              dominantBaseline="middle"
            >
              {typeIcons[marker.type as keyof typeof typeIcons] || "●"}
            </text>
            <text
              x={x}
              y={y - 20}
              textAnchor="middle"
              fontSize="11"
              fill="#1e293b"
              fontWeight="600"
              style={{ fontFamily: "system-ui, sans-serif" }}
            >
              {marker.name}
            </text>
            {isSelected && (
              <circle
                cx={x}
                cy={y}
                r={22}
                fill="none"
                stroke="#4f46e5"
                strokeWidth={2}
                strokeDasharray="4,4"
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

export const Route = createFileRoute("/customer-nav")({
  component: CustomerNavPage,
});