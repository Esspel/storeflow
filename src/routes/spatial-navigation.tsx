/**
 * Spatial Navigation Route
 * 3D store view with AR navigation - Protected route
 */

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Search,
  Navigation,
  Layers,
  Box,
  MapPin,
  ArrowUpRight,
  Target,
  RotateCw,
  Minimize,
  Package,
  MapPin as MapPinIcon,
  DoorOpen,
  DoorClosed,
  Route as RouteIcon,
  Box as CubeIcon,
  Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { StoreMap3D } from "@/components/StoreMap3D";
import { ARNavigationView } from "@/components/ARNavigationView";
import { AROverlay } from "@/components/AROverlay";
import { useARNetwork } from "@/hooks/useARNetwork";
import type { NavigationPath3D, Marker3DConfig } from "@/lib/three-types";
import { getSpatialMap, getShelfCompliance } from "@/lib/digital-twin";

interface SpatialMarker {
  id: string;
  name: string;
  type: "shelf" | "product" | "zone" | "entrance" | "exit" | "aisle";
  position: { x: number; y: number; z: number };
  rotation?: { x: number; y: number; z: number; w: number };
  metadata?: Record<string, unknown>;
}

interface SpatialMap {
  id: string;
  store_id: string;
  name: string;
  markers: SpatialMarker[];
  routes?: Array<{ from: string; to: string; distance: number }>;
}

function SpatialNavigationPage() {
  const { user, activeStore, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [maps, setMaps] = useState<SpatialMap[]>([]);
  const [selectedMap, setSelectedMap] = useState<SpatialMap | null>(null);
  const [selectedMarker, setSelectedMarker] = useState<SpatialMarker | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAR, setShowAR] = useState(false);
  const [show2D, setShow2D] = useState(true);
  const [show3D, setShow3D] = useState(false);
  const [navigationPath, setNavigationPath] = useState<NavigationPath3D | null>(null);
  const [markerConfig, setMarkerConfig] = useState<Marker3DConfig | null>(null);
  const [complianceData, setComplianceData] = useState<Record<string, unknown> | null>(null);

  // AR integration for spatial navigation
  const { isConnected: arConnected, isConnecting: arConnecting, network } = useARNetwork();

  useEffect(() => {
    if (!user && !authLoading) {
      navigate({ to: "/login" });
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!activeStore) return;
    (async () => {
      try {
        const map = await getSpatialMap(activeStore.id);
        if (map) {
          setMaps([map]);
          setSelectedMap(map);
        }
        const compliance = await getShelfCompliance(activeStore.id);
        setComplianceData(compliance);
      } catch (err) {
        console.error("Failed to load spatial data:", err);
      }
    })();
  }, [activeStore]);

  const filteredMarkers = useMemo(() => {
    if (!selectedMap?.markers) return [];
    if (!searchQuery) return selectedMap.markers;
    const q = searchQuery.toLowerCase();
    return selectedMap.markers.filter(
      (m) => m.name.toLowerCase().includes(q) || m.type.toLowerCase().includes(q),
    );
  }, [selectedMap, searchQuery]);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">3D Butiksvy</h1>
            <p className="text-coop-gray-600">Navigera i butiken med 3D-modell eller AR</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Butikskarta</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
                  <StoreMap3D
                    markers={filteredMarkers as any}
                    selectedMarkerId={selectedMarker?.id}
                    onMarkerClick={(m: any) => setSelectedMarker(m)}
                  />
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-2">
              <Button
                variant={show2D ? "default" : "outline"}
                onClick={() => {
                  setShow2D(true);
                  setShow3D(false);
                }}
              >
                2D
              </Button>
              <Button
                variant={show3D ? "default" : "outline"}
                onClick={() => {
                  setShow3D(true);
                  setShow2D(false);
                }}
              >
                3D
              </Button>
              <Button variant={showAR ? "default" : "outline"} onClick={() => setShowAR(!showAR)}>
                <Smartphone className="h-4 w-4 mr-2" />
                AR
              </Button>
            </div>
          </div>

          {showAR && activeStore?.id && (
            <div className="h-[600px] relative rounded-xl overflow-hidden" data-testid="spatial-ar-mode">
              {network ? (
                <AROverlay network={network} storeId={String(activeStore.id)} />
              ) : (
                <div className="h-full flex items-center justify-center bg-slate-900 text-coop-gray-600">
                  <p>AR icke tillgängligt</p>
                </div>
              )}
            </div>
          )}

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Personal – lager &amp; efterlevnad</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {complianceData ? (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-coop-gray-600">Planogram-efterlevnad</span>
                      <span
                        className={`font-bold ${
                          (complianceData as any).score >= 80
                            ? "text-green-600"
                            : (complianceData as any).score >= 50
                              ? "text-amber-600"
                              : "text-red-600"
                        }`}
                      >
                        {(complianceData as any).score ?? 0}%
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-red-50 dark:bg-red-950 rounded px-2 py-1 text-center">
                        <div className="text-xs text-coop-gray-600">Saknas</div>
                        <div className="font-semibold text-red-700 dark:text-red-300">
                          {(complianceData as any).missing ?? 0}
                        </div>
                      </div>
                      <div className="bg-amber-50 dark:bg-amber-950 rounded px-2 py-1 text-center">
                        <div className="text-xs text-coop-gray-600">Felplacerad</div>
                        <div className="font-semibold text-amber-700 dark:text-amber-300">
                          {(complianceData as any).misplaced ?? 0}
                        </div>
                      </div>
                      <div className="bg-green-50 dark:bg-green-950 rounded px-2 py-1 text-center">
                        <div className="text-xs text-coop-gray-600">Extra</div>
                        <div className="font-semibold text-green-700 dark:text-green-300">
                          {(complianceData as any).extra ?? 0}
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-coop-gray-600">Laddar efterlevnadsdata...</p>
                )}
                <div className="border-t pt-3">
                  <p className="text-xs text-coop-gray-600">
                    Lagerstatus per hylla visas när en markör väljs.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Markörer</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Input
                    placeholder="Sök markör..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <div className="max-h-96 overflow-y-auto space-y-2">
                    {filteredMarkers.map((marker) => (
                      <div
                        key={marker.id}
                        className={`p-2 rounded border cursor-pointer hover:bg-muted/50 ${
                          selectedMarker?.id === marker.id ? "border-primary bg-primary/5" : ""
                        }`}
                        onClick={() => setSelectedMarker(marker)}
                      >
                        <div className="flex items-center gap-2">
                          <MapPinIcon className="h-4 w-4" />
                          <div className="flex-1">
                            <p className="text-sm font-medium">{marker.name}</p>
                            <p className="text-xs text-coop-gray-600 capitalize">
                              {marker.type}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {selectedMarker && (
              <Card>
                <CardHeader>
                  <CardTitle>{selectedMarker.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-coop-gray-600">Typ:</span>
                      <span className="capitalize">{selectedMarker.type}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-coop-gray-600">Position:</span>
                      <span>
                        {selectedMarker.position.x.toFixed(2)},{" "}
                        {selectedMarker.position.y.toFixed(2)},{" "}
                        {selectedMarker.position.z.toFixed(2)}
                      </span>
                    </div>
                  </div>
                  <Button
                    className="w-full mt-4"
                    onClick={() => {
                      setSelectedMarker(null);
                    }}
                  >
                    Stäng
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/spatial-navigation")({
  component: SpatialNavigationPage,
});
