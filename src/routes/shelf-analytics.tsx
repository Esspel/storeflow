/**
 * Shelf Analytics & Planogram Compliance Route Component
 * Protected route - requires authentication to access confidential planogram data
 */

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  BarChart3,
  Layers,
  ScanLine,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  TrendingUp,
  Search,
  FileSpreadsheet,
  Lock,
  Link as LinkIcon,
  Link2,
  Unlink2,
  Plus,
  Settings,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ShelfScanner } from "@/components/shelf-scanner";
import { PlanogramUpload } from "@/components/planogram-upload";
import type { PlanogramCheckResult } from "@/lib/planogram-engine";
import { useAuth } from "@/lib/auth-context";
import { getShelfPlanograms, getSpatialMarkersForStore, linkPlanogramToMarker, unlinkPlanogramFromMarker } from "@/lib/supabase";
import { exportCSV } from "@/lib/csv";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

interface ShelfPlanogram {
  id: string;
  store_id: string;
  shelf_marker_id: string | null;
  name: string;
  expected_products: ExpectedProduct[];
  version: number;
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

interface ExpectedProduct {
  product_id: string;
  ean: string;
  name: string;
  position: { x: number; y: number; z: number };
  facings: number;
  quantity: number;
}

interface SpatialMarker {
  id: string;
  store_id: string;
  map_id: string;
  marker_type: "aruco" | "qr" | "combined";
  aruco_id: number | null;
  qr_content: string | null;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number } | null;
  shelf_id: string | null;
  shelf_name: string | null;
  size_meters: number | null;
  is_active: boolean;
  detected_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface ShelfData {
  id: string;
  name: string;
  category: string;
  complianceScore: number;
  lastScanned: string;
  status: "compliant" | "warning" | "critical";
  totalFacings: number;
  missingFacings: number;
  planogramId?: string;
  markerId?: string;
  markerName?: string;
}

function ShelfAnalyticsComponent() {
  const { user, loading: authLoading, activeStore } = useAuth();
  const navigate = useNavigate();
  const [shelves, setShelves] = useState<ShelfData[]>([]);
  const [planograms, setPlanograms] = useState<ShelfPlanogram[]>([]);
  const [spatialMarkers, setSpatialMarkers] = useState<SpatialMarker[]>([]);
  const [activeScannerShelf, setActiveScannerShelf] = useState<ShelfData | null>(null);
  const [selectedShelf, setSelectedShelf] = useState<ShelfData | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [linkingPlanogramId, setLinkingPlanogramId] = useState<string | null>(null);

  // Load data from Supabase
  useEffect(() => {
    if (!activeStore?.id || !user) return;
    setLoading(true);
    Promise.all([
      getShelfPlanograms(activeStore.id),
      getSpatialMarkersForStore(activeStore.id),
    ])
      .then(([p, m]) => {
        setPlanograms(p);
        setSpatialMarkers(m);

        // Combine planograms with markers for shelf list
        const combined: ShelfData[] = p.map((planogram) => {
          const marker = planogram.shelf_marker_id ? m.find((sm) => sm.id === planogram.shelf_marker_id) : null;
          return {
            id: planogram.id,
            name: planogram.name,
            category: "Planogram",
            complianceScore: 0, // Will be updated after scan
            lastScanned: "Aldrig skannad",
            status: "compliant" as const,
            totalFacings: planogram.expected_products?.length || 0,
            missingFacings: 0,
            planogramId: planogram.id,
            markerId: marker?.id,
            markerName: marker?.shelf_name || undefined,
          };
        });

        // Add markers without planograms
        m.forEach((marker) => {
          if (!combined.some((s) => s.markerId === marker.id)) {
            combined.push({
              id: marker.id,
              name: marker.shelf_name || `Marker ${marker.aruco_id}`,
              category: "Spatial Marker",
              complianceScore: 0,
              lastScanned: "Aldrig skannad",
              status: "compliant" as const,
              totalFacings: 0,
              missingFacings: 0,
              markerId: marker.id,
              markerName: marker.shelf_name || undefined,
            });
          }
        });

        setShelves(combined);
        setSelectedShelf(combined[0] || null);
      })
      .catch((err) => {
        console.error("Failed to load shelf data:", err);
        toast.error("Kunde inte ladda hyll-data");
      })
      .finally(() => setLoading(false));
  }, [activeStore?.id, user]);

  // Redirect to login if not authenticated (planogram data is confidential)
  useEffect(() => {
    if (!authLoading && !user) {
      navigate({ to: "/login", replace: true });
    }
  }, [user, authLoading, navigate]);

  // Show loading or access denied while checking auth
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
          <Lock className="w-16 h-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">
            Autentisering krävs
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mb-6 max-w-md">
            Planogramdata är konfidentiell och kräver inloggning. Logga in för att komma åt
            hyllanalys och planogram-efterlevnad.
          </p>
          <Button onClick={() => navigate({ to: "/login" })} className="w-full sm:w-auto">
            Logga in
          </Button>
        </div>
      </div>
    );
  }

  const handleScanComplete = (_obs: unknown, compliance?: PlanogramCheckResult) => {
    if (compliance && activeScannerShelf) {
      // update state if needed
    }
  };

  const handleExportReport = () => {
    const rows: (string | number | boolean | null | undefined)[][] = [
      ["Hylla", "Planogram", "Status", "Poäng", "Förväntade", "Saknade", "Felplacerade", "Övriga", "Senast skannad"],
    ];
    for (const s of shelves) {
      rows.push([
        s.name,
        s.markerName || "",
        s.status,
        s.complianceScore,
        s.totalFacings,
        s.missingFacings,
        0,
        Math.max(0, s.totalFacings - s.missingFacings),
        s.lastScanned,
      ]);
    }
    exportCSV(rows, `planogram-rapport-${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success("Rapport exporterad");
  };

  const filteredShelves = shelves.filter(
    (shelf) =>
      shelf.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      shelf.category.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <ScanLine className="w-6 h-6 text-indigo-500" />
              Planogram & Hyllanalys
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              Skanna hyllor med posemesh CV för att kontrollera planogram-efterlevnad
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2" onClick={handleExportReport}>
              <Download className="w-4 h-4" />
              Exportera rapport
            </Button>
          </div>
        </div>

        {/* Planogram Upload */}
        <PlanogramUpload storeId={activeStore?.id ?? ""} />

        {/* Main Content */}
        <div className="grid lg:grid-cols-[1fr_420px] gap-6">
          {/* Left Column: Shelf List */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Hyllor ({shelves.length})
              </h2>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Sök hylla..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="space-y-2">
              {filteredShelves.map((shelf) => (
                <div
                  key={shelf.id}
                  className={`group p-4 rounded-xl border transition-all ${
                    selectedShelf?.id === shelf.id
                      ? "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-500/30"
                      : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                  }`}
                  onClick={() => setSelectedShelf(shelf)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Layers className="w-4 h-4 text-slate-400" />
                        <h3 className="font-medium text-slate-900 dark:text-slate-100 truncate">
                          {shelf.name}
                        </h3>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{shelf.category}</p>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-sm font-semibold text-slate-200">
                          {shelf.complianceScore}% efterlevnad
                        </div>
                        <div className="text-xs text-slate-400">{shelf.missingFacings} saknas</div>
                      </div>

                      <Button
                        size="sm"
                        className="bg-indigo-600 hover:bg-indigo-500 text-white gap-1.5"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveScannerShelf(shelf);
                        }}
                      >
                        <ScanLine className="w-4 h-4" /> Skanna
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <div className="space-y-2 w-full">
                      <span className="text-xs text-slate-400">Planogram Status</span>
                      <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden flex">
                        <div
                          className="bg-emerald-500 h-full"
                          style={{ width: `${shelf.complianceScore}%` }}
                        />
                        <div
                          className="bg-rose-500 h-full"
                          style={{ width: `${100 - shelf.complianceScore}%` }}
                        />
                      </div>
                    </div>

                    <Badge
                      className={
                        shelf.status === "compliant"
                          ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                          : shelf.status === "warning"
                            ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                            : "bg-rose-500/20 text-rose-300 border-rose-500/30"
                      }
                    >
                      {shelf.status === "compliant" && "Godkänd"}
                      {shelf.status === "warning" && "Varning"}
                      {shelf.status === "critical" && "Kritiskt"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column: Detailed Shelf View */}
          <div className="space-y-4">
            {selectedShelf ? (
              <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
                <CardHeader border-b border-slate-200 dark:border-slate-700>
                  <CardTitle className="text-base text-slate-900 dark:text-slate-100 flex items-center justify-between">
                    <span>{selectedShelf.name}</span>
                    <Badge
                      className={
                        selectedShelf.status === "compliant"
                          ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                          : selectedShelf.status === "warning"
                            ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                            : "bg-rose-500/20 text-rose-300 border-rose-500/30"
                      }
                    >
                      {selectedShelf.status === "compliant" && "Godkänd"}
                      {selectedShelf.status === "warning" && "Varning"}
                      {selectedShelf.status === "critical" && "Kritiskt"}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  <div className="space-y-2">
                    <span className="text-xs text-slate-400">Planogram Status</span>
                    <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden flex">
                      <div
                        className="bg-emerald-500 h-full"
                        style={{ width: `${selectedShelf.complianceScore}%` }}
                      />
                      <div
                        className="bg-rose-500 h-full"
                        style={{ width: `${100 - selectedShelf.complianceScore}%` }}
                      />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-2">
                    <h4 className="text-xs font-semibold text-slate-300">
                      Identifierade Avvikelser
                    </h4>
                    <div className="space-y-2 text-xs">
                      <div className="p-2.5 bg-slate-50 dark:bg-slate-950/60 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                        <span className="text-slate-600 dark:text-slate-300 flex items-center gap-2">
                          <XCircle className="w-4 h-4 text-rose-400" /> Gevalia Mellanrost (Saknas)
                        </span>
                        <Badge className="bg-rose-500/10 text-rose-300 border-rose-500/20 text-[10px]">
                          2 facings
                        </Badge>
                      </div>
                      <div className="p-2.5 bg-slate-50 dark:bg-slate-950/60 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                        <span className="text-slate-600 dark:text-slate-300 flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-400" /> Zoégas Skånerost
                          (Felplacerad)
                        </span>
                        <Badge className="bg-amber-500/10 text-amber-300 border-amber-500/20 text-[10px]">
                          Hyllplan 2
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <Button
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white gap-2"
                    onClick={() => setActiveScannerShelf(selectedShelf!)}
                  >
                    <ScanLine className="w-4 h-4" /> Starta skanning
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-center py-12">
                <BarChart3 className="w-12 h-12 mx-auto text-slate-400 mb-3" />
                <p className="text-slate-500 dark:text-slate-400">
                  Välj en hylla för att se detaljer
                </p>
              </Card>
            )}

            {/* Stats Cards */}
            <div className="grid grid-cols-3 gap-3">
              <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 p-4 text-center">
                <div className="text-2xl font-bold text-indigo-500">
                  {shelves.filter((s) => s.status === "compliant").length}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Godkända</div>
              </Card>
              <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 p-4 text-center">
                <div className="text-2xl font-bold text-amber-500">
                  {shelves.filter((s) => s.status === "warning").length}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Varning</div>
              </Card>
              <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 p-4 text-center">
                <div className="text-2xl font-bold text-rose-500">
                  {shelves.filter((s) => s.status === "critical").length}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Kritiskt</div>
              </Card>
            </div>

            {/* QR Code Generator moved to store-setup */}

            {/* Planogram & Spatial Marker Linking */}
            <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 mt-4">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Settings className="w-5 h-5 text-indigo-500" />
                  Koppla planogram till spatiala markörer
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Koppla dina planogram (från PDF-uppladdning) till de spatiala markörerna som skapades i Digital Twin.
                  Detta möjliggör automatisk planogram-efterlevnadskontroll vid skanning.
                </p>

                <div className="space-y-3">
                  {planograms.map((planogram) => {
                    const linkedMarker = planogram.shelf_marker_id
                      ? spatialMarkers.find((m) => m.id === planogram.shelf_marker_id)
                      : null;
                    const isLinking = linkingPlanogramId === planogram.id;

                    return (
                      <div
                        key={planogram.id}
                        className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                              {planogram.name}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              {planogram.expected_products?.length || 0} produkter{" "}
                              {planogram.shelf_marker_id
                                ? " • Kopplad till " + (linkedMarker?.shelf_name || linkedMarker?.aruco_id)
                                : " • Ej kopplad"}
                            </div>
                          </div>

                          {isLinking ? (
                            <div className="flex items-center gap-2">
                              <Select
                                value={planogram.shelf_marker_id || ""}
                                onValueChange={(value) => {
                                  if (!value) {
                                    unlinkPlanogramFromMarker(planogram.id).then(() => {
                                      setPlanograms((prev) =>
                                        prev.map((p) =>
                                          p.id === planogram.id ? { ...p, shelf_marker_id: null } : p,
                                        ),
                                      );
                                      setLinkingPlanogramId(null);
                                      toast.success("Koppling borttagen");
                                    }).catch(() => toast.error("Misslyckades"));
                                  } else {
                                    linkPlanogramToMarker(planogram.id, value).then(() => {
                                      setPlanograms((prev) =>
                                        prev.map((p) =>
                                          p.id === planogram.id ? { ...p, shelf_marker_id: value } : p,
                                        ),
                                      );
                                      setLinkingPlanogramId(null);
                                      toast.success("Planogram kopplat till markör");
                                    }).catch(() => toast.error("Misslyckades att koppla"));
                                  }
                                }}
                              >
                                <SelectTrigger className="w-48">
                                  <SelectValue placeholder="Välj markör..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {spatialMarkers
                                    .filter((m) => !planograms.some((p) => p.shelf_marker_id === m.id && p.id !== planogram.id))
                                    .map((marker) => (
                                      <SelectItem key={marker.id} value={marker.id}>
                                        {marker.shelf_name || `ArUco ${marker.aruco_id}`} ({marker.marker_type})
                                      </SelectItem>
                                    ))}
                                  <SelectItem value="">
                                    Ta bort koppling
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setLinkingPlanogramId(null)}
                              >
                                <XCircle className="w-4 h-4" />
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant={planogram.shelf_marker_id ? "outline" : "default"}
                              onClick={() => setLinkingPlanogramId(planogram.id)}
                              className="gap-1.5"
                            >
                              {planogram.shelf_marker_id ? (
                                <>
                                  <Unlink2 className="w-4 h-4" />
                                  Byt koppling
                                </>
                              ) : (
                                <>
                                  <Link2 className="w-4 h-4" />
                                  Koppla markör
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {planograms.length === 0 && (
                  <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                    <Layers className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>Inga planogram uppladdade ännu. Ladda upp PDF på Rapporter-sidan.</p>
                  </div>
                )}

                {spatialMarkers.length === 0 && planograms.length > 0 && (
                  <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4">
                    <AlertTriangle className="w-5 h-5 text-amber-500 mb-2" />
                    <p className="text-sm text-amber-700 dark:text-amber-300">
                      Inga spatiala markörer hittades. Skapa markörer i Butiksinstallation → Digital Twin först.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Shelf Scanner Modal */}
        {activeScannerShelf && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="w-full max-w-4xl h-[85vh] max-h-[85vh] bg-slate-950 rounded-xl overflow-hidden border border-slate-800 shadow-2xl">
              <ShelfScanner
                shelfId={activeScannerShelf.id}
                shelfName={activeScannerShelf.name}
                onScanComplete={handleScanComplete}
                onClose={() => setActiveScannerShelf(null)}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/shelf-analytics")({
  component: ShelfAnalyticsComponent,
});
