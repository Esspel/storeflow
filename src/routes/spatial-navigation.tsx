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
  Home,
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
import { WorldOffsetProvider } from "@/hooks/useWorldOffset";
import type { NavigationPath3D, Marker3DConfig } from "@/lib/three-types";

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
  const [viewMode, setViewMode] = useState<"3d" | "map" | "ar">("map");
  const [loading, setLoading] = useState(false);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      navigate({ to: "/login", replace: true });
    }
  }, [user, authLoading, navigate]);

  if (authLoading) {
    return (
      <div className="min-h-full bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-500 border-t-transparent mx-auto mb-4" />
          <p className="text-slate-600 dark:text-slate-400">Kontrollerar autentisering...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-full bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="text-center p-8">
          <svg className="w-16 h-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">Autentisering krävs</h2>
          <p className="text-slate-600 dark:text-slate-400 mb-6 max-w-md">
            3D butiksvyn är konfidentiell och kräver inloggning. Logga in för att komma åt spatial navigering.
          </p>
          <Button onClick={() => navigate({ to: "/login" })}>Logga in</Button>
        </div>
      </div>
    );
  }

  // Load spatial maps for the active store
  useEffect(() => {
    if (!activeStore?.id) return;
    setLoading(true);
    supabase
      .from("spatial_maps")
      .select("*")
      .eq("store_id", activeStore.id)
      .then(({ data, error }) => {
        if (error) {
          console.error("Failed to load maps:", error);
        } else if (data) {
          setMaps(data as SpatialMap[]);
          if (data.length > 0) setSelectedMap(data[0]);
        }
        setLoading(false);
      });
  }, [activeStore?.id]);

  const filteredMarkers = selectedMap
    ? selectedMap.markers.filter(
        (marker) =>
          marker.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          marker.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
          marker.id.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : [];

  const typeColors = {
    shelf: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    product: "bg-green-500/20 text-green-300 border-green-500/30",
    zone: "bg-purple-500/20 text-purple-300 border-purple-500/30",
    entrance: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    exit: "bg-rose-500/20 text-rose-300 border-rose-500/30",
    aisle: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  };

  const typeIcons = {
    shelf: Package,
    product: Box,
    zone: MapPinIcon,
    entrance: DoorOpen,
    exit: DoorClosed,
    aisle: RouteIcon,
  };

  const TypeIcon = ({ type, className }: { type: keyof typeof typeIcons; className?: string }) => {
    const Icon = typeIcons[type];
    return <Icon className={className} />;
  };

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Navigation className="w-6 h-6 text-indigo-500" />
              3D Butiksvy & Navigering
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              Utforska butiken i 3D, hitta produkter och navigera med AR
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Fullscreen button removed per refactoring */}
          </div>
        </div>

        {/* Main Content */}
        <div className="grid lg:grid-cols-[1fr_380px] gap-6">
          {/* Left Column: 3D View / Map View */}
          <div className="space-y-4">
            {/* View Mode Selector */}
            <div className="flex items-center gap-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-2">
              {(["map", "3d", "ar"] as const).map((mode) => (
                <Button
                  key={mode}
                  variant={viewMode === mode ? "default" : "ghost"}
                  size="sm"
                  className={cn(
                    "gap-1.5",
                    viewMode === mode && "bg-indigo-600 text-white"
                  )}
                  onClick={() => setViewMode(mode)}
                >
                  {mode === "map" && <MapPin className="w-4 h-4" />}
                  {mode === "3d" && <Box className="w-4 h-4" />}
                  {mode === "ar" && <Navigation className="w-4 h-4" />}
                  <span className="hidden sm:inline">{mode === "map" ? "Karta" : mode === "3d" ? "3D Vy" : "AR"}</span>
                </Button>
              ))}
            </div>

            {/* 3D/Map View Area */}
            <div
              className={cn(
                "relative bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden",
                "aspect-[4/3] md:aspect-[16/9]"
              )}
            >
              {viewMode === "map" && (
                <MapView
                  map={selectedMap}
                  selectedMarker={selectedMarker}
                  onMarkerClick={setSelectedMarker}
                />
              )}
              {viewMode === "3d" && (
                <ThreeDView
                  map={selectedMap}
                  selectedMarker={selectedMarker}
                  onMarkerClick={setSelectedMarker}
                />
              )}
              {viewMode === "ar" && (
                <ARView
                  map={selectedMap}
                  onClose={() => setViewMode("map")}
                />
              )}

              {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900/50">
                  <div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-500 border-t-transparent" />
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Marker List & Details */}
          <div className="space-y-4">
            {/* Map Selector */}
            {maps.length > 1 && (
              <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    Välj butikskarta
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <select
                    value={selectedMap?.id || ""}
                    onChange={(e) => {
                      const map = maps.find((m) => m.id === e.target.value);
                      if (map) setSelectedMap(map);
                    }}
                    className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-slate-100"
                  >
                    {maps.map((map) => (
                      <option key={map.id} value={map.id}>
                        {map.name}
                      </option>
                    ))}
                  </select>
                </CardContent>
              </Card>
            )}

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Sök markör..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Marker List */}
            <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-900 dark:text-slate-100 flex items-center justify-between">
                  Markörer ({filteredMarkers.length})
                  {selectedMap && (
                    <Badge variant="outline" className="text-xs">
                      {selectedMap.markers.length} totalt
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 max-h-[400px] overflow-y-auto">
                {filteredMarkers.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                    <MapPin className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>Inga markörer hittades</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredMarkers.map((marker) => (
                      <div
                        key={marker.id}
                        className={cn(
                          "p-3 rounded-lg border transition-all cursor-pointer",
                          selectedMarker?.id === marker.id
                            ? "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-500/30"
                            : "bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                        )}
                        onClick={() => setSelectedMarker(marker)}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={cn(
                              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                              typeColors[marker.type]
                            )}
                          >
                            <TypeIcon type={marker.type} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm text-slate-900 dark:text-slate-100 truncate">
                              {marker.name}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">
                              {marker.type}
                            </p>
                          </div>
                          {selectedMarker?.id === marker.id && (
                            <RotateCw className="w-4 h-4 text-indigo-500" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Selected Marker Details */}
            {selectedMarker && (
              <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <TypeIcon type={selectedMarker.type} className={cn("w-4 h-4", typeColors[selectedMarker.type].replace("bg-", "text-").replace("border-", "").replace("/20", "").replace("/30", ""))} />
                    {selectedMarker.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 space-y-3">
                  <Badge className={cn("text-xs capitalize", typeColors[selectedMarker.type])}>
                    {selectedMarker.type}
                  </Badge>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-slate-500 dark:text-slate-400">X</p>
                      <p className="font-mono text-slate-900 dark:text-slate-100">{selectedMarker.position.x.toFixed(2)}m</p>
                    </div>
                    <div>
                      <p className="text-slate-500 dark:text-slate-400">Y</p>
                      <p className="font-mono text-slate-900 dark:text-slate-100">{selectedMarker.position.y.toFixed(2)}m</p>
                    </div>
                    <div>
                      <p className="text-slate-500 dark:text-slate-400">Z</p>
                      <p className="font-mono text-slate-900 dark:text-slate-100">{selectedMarker.position.z.toFixed(2)}m</p>
                    </div>
                  </div>
                  {selectedMarker.metadata && Object.keys(selectedMarker.metadata).length > 0 && (
                    <details className="text-xs">
                      <summary className="text-slate-500 dark:text-slate-400 cursor-pointer">Metadata</summary>
                      <pre className="mt-1 text-slate-700 dark:text-slate-300 overflow-auto max-h-24">
                        {JSON.stringify(selectedMarker.metadata, null, 2)}
                      </pre>
                    </details>
                  )}
                  <Button
                    className="w-full gap-2"
                    variant={viewMode === "ar" ? "default" : "outline"}
                    onClick={() => setViewMode("ar")}
                  >
                    <Navigation className="w-4 h-4" />
                    {viewMode === "ar" ? "AR aktiv" : "Starta AR-navigering"}
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

// Map View Component (2D top-down view)
function MapView({
  map,
  selectedMarker,
  onMarkerClick,
}: {
  map: SpatialMap | null;
  selectedMarker: SpatialMarker | null;
  onMarkerClick: (marker: SpatialMarker) => void;
}) {
  if (!map) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 dark:text-slate-400">
        <p>Ingen karta vald</p>
      </div>
    );
  }

  // Simple SVG-based 2D map
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
              r={isSelected ? 14 : 10}
              fill={typeColors[marker.type]}
              opacity={isSelected ? 1 : 0.8}
              stroke={isSelected ? "#4f46e5" : "white"}
              strokeWidth={isSelected ? 3 : 2}
              filter="drop-shadow(0 2px 4px rgba(0,0,0,0.1))"
            />
            <text
              x={x}
              y={y - 16}
              textAnchor="middle"
              fontSize="10"
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
                r={18}
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

// 3D View Component (using StoreMap3D)
function ThreeDView({
  map,
  selectedMarker,
  onMarkerClick,
}: {
  map: SpatialMap | null;
  selectedMarker: SpatialMarker | null;
  onMarkerClick: (marker: SpatialMarker) => void;
}) {
  if (!map) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 dark:text-slate-400">
        <p>Ingen karta vald</p>
      </div>
    );
  }
  const markers: Marker3DConfig[] = map.markers.map((m) => ({
    id: m.id,
    name: m.name,
    type: m.type,
    position: { x: m.position.x, y: m.position.y, z: m.position.z },
    rotation: m.rotation ? { x: m.rotation.x, y: m.rotation.y, z: m.rotation.z, w: m.rotation.w } : undefined,
    metadata: m.metadata,
    isSelected: selectedMarker?.id === m.id,
  }));
  return (
    <StoreMap3D
      markers={markers}
      selectedMarkerId={selectedMarker?.id}
      onMarkerClick={(m) => {
        const orig = map.markers.find((x) => x.id === m.id);
        if (orig) onMarkerClick(orig);
      }}
      backgroundColor="#f8fafc"
      enableOrbitControls={true}
      showGrid={true}
      className="w-full h-full"
    />
  );
}

// AR View Component (using ARNavigationView with WorldOffsetProvider)
function ARView({
  map,
  onClose,
}: {
  map: SpatialMap | null;
  onClose: () => void;
}) {
  if (!map) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 dark:text-slate-400">
        <p>Ingen karta vald</p>
      </div>
    );
  }
  const markers: Marker3DConfig[] = map.markers.map((m) => ({
    id: m.id,
    name: m.name,
    type: m.type,
    position: { x: m.position.x, y: m.position.y, z: m.position.z },
    rotation: m.rotation ? { x: m.rotation.x, y: m.rotation.y, z: m.rotation.z, w: m.rotation.w } : undefined,
    metadata: m.metadata,
    isTarget: false,
    isUserPosition: false,
  }));
  const navigationPath: NavigationPath3D | undefined = map.routes?.[0] ? {
    waypoints: map.routes[0].from && map.routes[0].to
      ? [
          map.markers.find((m) => m.id === map.routes[0].from)?.position ?? { x: 0, y: 0, z: 0 },
          ...(map.routes[0].intermediatePoints ?? []).map((p) => ({ x: p.x, y: p.y, z: p.z })),
          map.markers.find((m) => m.id === map.routes[0].to)?.position ?? { x: 0, y: 0, z: 0 }
        ]
      : [],
    totalDistance: map.routes[0].distance ?? 0,
    estimatedTimeSeconds: (map.routes[0].distance ?? 0) / 1.4,
    color: "#fbbf24"
  } : undefined;

  return (
    <WorldOffsetProvider>
      <div className="relative w-full h-full">
        <ARNavigationView
          markers={markers}
          navigationPath={navigationPath}
          targetMarkerId={selectedMarker?.id}
          userPose={null}
          onSessionStart={() => {
            console.log('AR session started');
          }}
          onSessionEnd={() => {
            console.log('AR session ended');
          }}
          onMarkerSelect={(markerId) => {
            const marker = map.markers.find((m) => m.id === markerId);
            if (marker) setSelectedMarker(marker);
          }}
          showDebug={false}
          className="w-full h-full"
        />
        <button
          onClick={onClose}
          className="absolute top-4 left-4 bg-white/80 dark:bg-slate-900/80 rounded-lg p-2 hover:bg-white/90 dark:hover:bg-slate-800/90 backdrop-blur transition-all"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-800 dark:text-slate-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    </WorldOffsetProvider>
  );
}

export const Route = createFileRoute("/spatial-navigation")({
  component: SpatialNavigationPage,
});