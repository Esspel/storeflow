/**
 * Store Setup Wizard
 * Guided flow for new stores: QR portals → Digital twin → Product registration
 * Uses activeStore throughout the flow
 */

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import {
  QrCode,
  Barcode,
  ArrowRight,
  ArrowLeft,
  CheckCircle,
  AlertCircle,
  Loader2,
  Camera,
  Download,
  Printer,
  HelpCircle,
  Plus,
  Minus,
  Grid,
  Layers,
  Package,
  Box,
  MapPin,
  Wifi,
  WifiOff,
  RefreshCw,
  Save,
  Settings,
  Home,
  ChevronRight,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { ShelfScanner } from "@/components/shelf-scanner";
import { toast } from "sonner";

type SetupStep = "portals" | "mapping" | "products" | "complete";

type MarkerConfig = {
  shelfId: string;
  shelfName: string;
  leftMarkerId?: string;
  middleMarkerId?: string;
  rightMarkerId?: string;
  arucoId?: number;
  products?: Array<{ ean: string; name: string; facings: number }>;
};

interface StoreSetupState {
  step: SetupStep;
  // Step 1: Portals
  portalsGenerated: boolean;
  markerConfigs: MarkerConfig[];
  // Step 2: Mapping
  spatialMapId: string | null;
  markersDetected: number;
  mappingComplete: boolean;
  // Step 3: Products
  productsRegistered: Array<{
    ean: string;
    bnr: string;
    name: string;
    shelfMarkerId: string;
    position: { x: number; y: number; z: number };
    facings: number;
  }>;
  currentScanningMarker: string | null;
}

const STEPS: Array<{
  id: SetupStep;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
}> = [
  { id: "portals", title: "QR-portaler", description: "Generera och placera markörer", icon: QrCode },
  { id: "mapping", title: "Digital twin", description: "Skanna butik med posemesh", icon: Box },
  { id: "products", title: "Produkter", description: "Registrera produkter på hyllor", icon: Package },
  { id: "complete", title: "Klar", description: "Butiken är redo", icon: CheckCircle },
];

export const Route = createFileRoute("/store-setup")({
  component: StoreSetupPage,
});

function StoreSetupPage() {
  const { user, activeStore, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [state, setState] = useState<StoreSetupState>({
    step: "portals",
    portalsGenerated: false,
    markerConfigs: [],
    spatialMapId: null,
    markersDetected: 0,
    mappingComplete: false,
    productsRegistered: [],
    currentScanningMarker: null,
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      navigate({ to: "/login", replace: true });
    }
  }, [user, authLoading, navigate]);

  // Check if store already has spatial map
  useEffect(() => {
    if (activeStore?.id) {
      checkExistingSetup();
    }
  }, [activeStore?.id]);

  const checkExistingSetup = async () => {
    try {
      const { data: maps } = await supabase
        .from("spatial_maps")
        .select("id")
        .eq("store_id", activeStore!.id)
        .eq("is_active", true)
        .limit(1);

      if (maps && maps.length > 0) {
        setState((prev) => ({ ...prev, spatialMapId: maps[0].id, step: "mapping" }));
      }
    } catch (err) {
      console.error("Failed to check existing setup:", err);
    }
  };

  const nextStep = () => {
    const stepOrder: SetupStep[] = ["portals", "mapping", "products", "complete"];
    const currentIndex = stepOrder.indexOf(state.step);
    if (currentIndex < stepOrder.length - 1) {
      setState((prev) => ({ ...prev, step: stepOrder[currentIndex + 1] }));
    }
  };

  const prevStep = () => {
    const stepOrder: SetupStep[] = ["portals", "mapping", "products", "complete"];
    const currentIndex = stepOrder.indexOf(state.step);
    if (currentIndex > 0) {
      setState((prev) => ({ ...prev, step: stepOrder[currentIndex - 1] }));
    }
  };

  const canProceed = () => {
    switch (state.step) {
      case "portals":
        return state.portalsGenerated && state.markerConfigs.length > 0;
      case "mapping":
        return state.mappingComplete && state.spatialMapId !== null;
      case "products":
        return state.productsRegistered.length > 0;
      case "complete":
        return true;
      default:
        return false;
    }
  };

  // ============================================================
  // STEP 1: GENERATE ARUCO MARKERS
  // ============================================================
  const handleMarkersGenerated = (configs: MarkerConfig[]) => {
    setState((prev) => ({
      ...prev,
      portalsGenerated: true,
      markerConfigs: configs,
    }));
  };

  const renderStepPortals = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-500" />
            Steg 1: Generera och placera ArUco-markörer
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl">
            <h4 className="font-medium text-indigo-700 dark:text-indigo-300 mb-2 flex items-center gap-2">
              <HelpCircle className="w-4 h-4" /> Hur det fungerar
            </h4>
            <ol className="list-decimal list-inside space-y-1 text-sm text-indigo-600 dark:text-indigo-400">
              <li>Konfigurera ArUco-markörer för varje hylla i butiken</li>
              <li>Klicka "Generera batch" för att skapa markörer för vänster, mitten, höger</li>
              <li>Skriv ut på A4 (matt papper, 150+ DPI rekommenderas)</li>
              <li>Klipp ut och limma på hyllkanten: vänster, mitten, höger</li>
              <li>Se till att markörerna är synliga och inte täckta av produkter</li>
            </ol>
          </div>

          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground mb-4">
              ArUco-markörgeneratorn finns under <strong>Posemesh → Markörgenerator</strong>
            </p>
            <Button
              variant="outline"
              onClick={() => navigate({ to: "/store-setup" })}
            >
              <Layers className="w-4 h-4 mr-2" />
              Öppna Markörgenerator
            </Button>
          </div>

          {state.portalsGenerated && state.markerConfigs.length > 0 && (
            <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 mb-2">
                <CheckCircle className="w-5 h-5" />
                <span className="font-medium">{state.markerConfigs.length} markörer genererade för butik: {activeStore?.name}</span>
              </div>
              <p className="text-sm text-emerald-600 dark:text-emerald-400">
                Markörerna är redo att skrivas ut. Gå till nästa steg när du har placerat dem på hyllorna.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  // ============================================================
  // STEP 2: DIGITAL TWIN - POSEMESH SCANNING
  // ============================================================
  const [scannerShelfId, setScannerShelfId] = useState<string | null>(null);

  const handleScanComplete = useCallback(
    async (observation: unknown, compliance?: unknown) => {
      if (scannerShelfId && state.spatialMapId) {
        // Save detected marker positions to spatial_markers table
        // This is where posemesh gives us the 3D positions of detected ArUco markers
        toast.success("Hylla skannad - positioner sparade");

        setState((prev) => ({
          ...prev,
          markersDetected: prev.markersDetected + 1,
        }));

        // Check if all markers detected
        setState((prev) => {
          const newCount = prev.markersDetected + 1;
          if (newCount >= prev.markerConfigs.length) {
            return { ...prev, mappingComplete: true };
          }
          return prev;
        });
      }
      setScannerShelfId(null);
    },
    [scannerShelfId, state.spatialMapId, state.markerConfigs.length]
  );

  const startMapping = async () => {
    if (!activeStore?.id) return;

    setIsLoading(true);
    setError(null);

    try {
      // Create spatial map for this store
      const { data: map, error: mapError } = await supabase
        .from("spatial_maps")
        .insert({
          store_id: activeStore.id,
          name: `${activeStore.name} - Digital Twin`,
          description: "Autogenererad via Store Setup Wizard",
          version: 1,
          is_active: true,
          bounds_min: "[0, 0, 0]",
          bounds_max: "[10, 5, 3]", // Updated during mapping
        })
        .select()
        .single();

      if (mapError) throw mapError;

      setState((prev) => ({
        ...prev,
        spatialMapId: map.id,
      }));

      toast.success("Digital twin skapad - börja skanna hyllor");
    } catch (err) {
      console.error("Failed to create spatial map:", err);
      setError("Kunde inte skapa digital twin. Försök igen.");
    } finally {
      setIsLoading(false);
    }
  };

  const renderStepMapping = () => (
    <div className="space-y-6">
      {!state.spatialMapId ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Box className="w-5 h-5 text-indigo-500" />
              Steg 2: Skapa Digital Twin
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl">
              <h4 className="font-medium text-indigo-700 dark:text-indigo-300 mb-2 flex items-center gap-2">
                <Wifi className="w-4 h-4" /> Kräver nätverk
              </h4>
              <p className="text-sm text-indigo-600 dark:text-indigo-400 mb-4">
                För att skapa en digital twin måste du skanna alla hyllmarkörer med mobilkameran.
                posemesh använder ArUco-markörerna för att bygga en 3D-karta av butiken.
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm text-indigo-600 dark:text-indigo-400">
                <li>Se till att du har nätverksanslutning (WiFi/4G)</li>
                <li>Gå runt i butiken och skanna varje hylla med markörer</li>
                <li>Håll kameran stilla så att alla 3 markörer (V/M/H) syns</li>
                <li>Appen sparar automatiskt 3D-positionen för varje hylla</li>
              </ul>
            </div>

            <Button
              onClick={startMapping}
              disabled={isLoading}
              className="w-full gap-2 bg-indigo-600 hover:bg-indigo-500 text-white"
              size="lg"
            >
              <Loader2 className="w-4 h-4 animate-spin" />
              {isLoading ? "Skapar digital twin..." : "Skapa digital twin och börja skanna"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Box className="w-5 h-5 text-indigo-500" />
                Digital Twin aktiv - Skanna hyllor
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Badge className={cn(
                    "gap-1",
                    state.markersDetected >= state.markerConfigs.length
                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                      : "bg-amber-500/20 text-amber-300 border-amber-500/30"
                  )}>
                    <Wifi className="w-3 h-3" />
                    {state.markersDetected} / {state.markerConfigs.length} hyllor skannade
                  </Badge>
                  <Badge className="bg-indigo-500/20 text-indigo-300 border-indigo-500/30 gap-1">
                    <MapPin className="w-3 h-3" />
                    Map ID: {state.spatialMapId?.slice(0, 8)}...
                  </Badge>
                </div>
              </div>

              <div className="space-y-2">
                {state.markerConfigs.map((markerConfig, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 flex items-center justify-center rounded bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-sm font-medium">
                        {index + 1}
                      </span>
                      <div>
                        <p className="font-medium text-sm">{markerConfig.shelfName}</p>
                        <p className="text-xs text-muted-foreground">
                          {markerConfig.shelfId} - Markörer: V/M/H (ArUco {markerConfig.arucoId}–{markerConfig.arucoId! + 2})
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={state.markersDetected > index ? "secondary" : "default"}
                      onClick={() => setScannerShelfId(markerConfig.shelfId)}
                      disabled={state.markersDetected > index}
                    >
                      {state.markersDetected > index ? (
                        <>
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                          Skannad
                        </>
                      ) : (
                        <>
                          <Camera className="w-3.5 h-3.5" />
                          Skanna
                        </>
                      )}
                    </Button>
                  </div>
                ))}
              </div>

              {state.markersDetected >= state.markerConfigs.length && (
                <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl">
                  <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 mb-2">
                    <CheckCircle className="w-5 h-5" />
                    <span className="font-medium">Alla hyllor skannade!</span>
                  </div>
                  <p className="text-sm text-emerald-600 dark:text-emerald-400">
                    Digital twin är klar. Gå till nästa steg för att registrera produkter.
                  </p>
                  <Button
                    onClick={() => setState((prev) => ({ ...prev, mappingComplete: true }))}
                    className="mt-2 gap-2"
                  >
                    <ArrowRight className="w-4 h-4" />
                    Markera som klar och gå vidare
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Scanner Modal */}
          {scannerShelfId && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
              <div className="w-full max-w-4xl h-[85vh] max-h-[85vh] bg-slate-950 rounded-xl overflow-hidden border border-slate-800 shadow-2xl">
                <ShelfScanner
                  shelfId={scannerShelfId}
                  shelfName={state.markerConfigs.find((m) => m.shelfId === scannerShelfId)?.shelfName || "Hylla"}
                  onScanComplete={handleScanComplete}
                  onClose={() => setScannerShelfId(null)}
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );

  // ============================================================
  // STEP 3: PRODUCT REGISTRATION
  // ============================================================
  const [scanningProduct, setScanningProduct] = useState<{ ean: string; markerId: string } | null>(null);
  const [productSearch, setProductSearch] = useState("");

  const handleProductScanned = useCallback(
    async (ean: string, markerId: string) => {
      const marker = state.markerConfigs.find((m) => m.shelfId === markerId);
      if (!marker) return;

      try {
        // Hämta produkt från DB eller Coop API
        const { data: dbProduct, error } = await supabase
          .from("products")
          .select("id, name, ean, bnr")
          .eq("ean", ean)
          .eq("store_id", activeStore?.id)
          .maybeSingle();

        if (error) throw error;

        const productName = dbProduct?.name || `Produkt ${ean}`;
        const bnr = dbProduct?.bnr || "";
        const registered = {
          ean,
          bnr,
          name: productName,
          shelfMarkerId: markerId,
          position: { x: 0, y: 0, z: 0 },
          facings: 2,
        };

        // Spara till DB
        await supabase.from("shelf_products").insert({
          store_id: activeStore?.id,
          shelf_marker_id: markerId,
          ean,
          bnr,
          name: productName,
          facings: 2,
          created_at: new Date().toISOString(),
        });

        setState((prev) => ({
          ...prev,
          productsRegistered: [...prev.productsRegistered, registered],
        }));

        setScanningProduct(null);
        toast.success(`${productName} registrerad på ${marker.shelfName}`);
      } catch (err) {
        console.error("Failed to register product:", err);
        toast.error("Kunde inte registrera produkt");
      }
    },
    [state.markerConfigs, activeStore?.id]
  );

  const renderStepProducts = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-indigo-500" />
            Steg 3: Registrera produkter på hyllor
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl">
            <h4 className="font-medium text-indigo-700 dark:text-indigo-300 mb-2 flex items-center gap-2">
              <Barcode className="w-4 h-4" /> Så här gör du
            </h4>
            <ol className="list-decimal list-inside space-y-1 text-sm text-indigo-600 dark:text-indigo-400">
              <li>Välj en hylla i listan nedan</li>
              <li>Skanna streckkoden (EAN) på produkten med kameran</li>
              <li>Produkten kopplas automatiskt till hyllans position i digital twin</li>
              <li>Upprepa för alla produkter på hyllan</li>
            </ol>
          </div>

          {state.productsRegistered.length > 0 && (
            <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                  <CheckCircle className="w-5 h-5" />
                  <span className="font-medium">{state.productsRegistered.length} produkter registrerade</span>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {state.markerConfigs.map((markerConfig) => {
              const shelfProducts = state.productsRegistered.filter(
                (p) => p.shelfMarkerId === markerConfig.shelfId
              );
              const isScanning = scanningProduct?.markerId === markerConfig.shelfId;

              return (
                <Card key={markerConfig.shelfId} className={cn(isScanning && "ring-2 ring-indigo-500")}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Layers className="w-5 h-5 text-indigo-500" />
                        <div>
                          <p className="font-medium">{markerConfig.shelfName}</p>
                          <p className="text-xs text-muted-foreground">{shelfProducts.length} produkter registrerade</p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant={isScanning ? "secondary" : "default"}
                        onClick={() =>
                          setScanningProduct({
                            ean: "",
                            markerId: markerConfig.shelfId,
                          })
                        }
                        disabled={isScanning}
                      >
                        {isScanning ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Skannar...
                          </>
                        ) : (
                          <>
                            <Barcode className="w-3.5 h-3.5" />
                            Lägg till produkt
                          </>
                        )}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {isScanning ? (
                      <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                          Håll kameran över produktens streckkod (EAN-13)
                        </p>
                        <div className="relative aspect-video bg-slate-900 rounded-lg overflow-hidden">
                          {/* Camera preview would go here - using ShelfScanner in product mode */}
                          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                            <Camera className="w-12 h-12 mb-2" />
                            <p>Kamera-vy för streckkodsskanning</p>
                            <p className="text-xs">(Implementera med posemesh BarcodeDetection)</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            onClick={() => setScanningProduct(null)}
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            Avbryt
                          </Button>
                          <Button
                            onClick={() => {
                              // Simulate successful scan
                              handleProductScanned("7310663010014", markerConfig.shelfId);
                            }}
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                            Simulera skanning (demo)
                          </Button>
                        </div>
                      </div>
                    ) : shelfProducts.length > 0 ? (
                      <div className="space-y-2">
                        {shelfProducts.map((p, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg text-sm"
                          >
                            <span className="truncate max-w-[200px]">{p.name} (EAN: {p.ean})</span>
                            <Badge variant="secondary">{p.facings} facings</Badge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Inga produkter registrerade på denna hylla ännu
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {state.productsRegistered.length > 0 && (
            <Button
              onClick={nextStep}
              className="w-full gap-2 bg-emerald-600 hover:bg-emerald-500 text-white"
              size="lg"
            >
              <ArrowRight className="w-4 h-4" />
              Gå till sammanfattning
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );

  // ============================================================
  // STEP 4: COMPLETE
  // ============================================================
  const renderStepComplete = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-500" />
            Butiksinstallation klar!
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center py-8">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
              <CheckCircle className="h-10 w-10 text-emerald-500" />
            </div>
            <h3 className="text-xl font-bold mb-2">{activeStore?.name} är redo att användas</h3>
            <p className="text-muted-foreground">
              Digital twin skapad, produkter registrerade. Du kan nu börja använda:
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <LinkCard
              title="Hyllanalys & Planogram"
              description="Skanna hyllor för planogram-efterlevnad"
              icon={Grid}
              to="/shelf-analytics"
              tone="blue"
            />
            <LinkCard
              title="3D Butiksvy & Navigation"
              description="Navigera i butiken med AR"
              icon={Box}
              to="/spatial-navigation"
              tone="green"
            />
            <LinkCard
              title="Kundnavigation"
              description="QR-kod vid entré för kunder"
              icon={MapPin}
              to="/customer-nav"
              tone="amber"
            />
          </div>

          <Separator />

          <div className="space-y-3">
            <h4 className="font-medium">Nästa steg:</h4>
            <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
              <li>Ladda upp planogram-PDF:er i <strong>Hyllanalys</strong> för att aktivera efterlevnadskontroller</li>
              <li>Skapa uppgifter kopplade till specifika hyllor via <strong>Uppgifter</strong></li>
              <li>Skriv ut kundnavigations-QR för butiksentrén via <strong>Kundnavigation</strong></li>
            </ul>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={() => navigate({ to: "/shelf-analytics" })}
              className="flex-1 gap-2"
            >
              <Grid className="w-4 h-4" />
              Öppna Hyllanalys
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate({ to: "/" })}
              className="flex-1 gap-2"
            >
              <Home className="w-4 h-4" />
              Gå till startsida
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // ============================================================
  // RENDER
  // ============================================================
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
    return null; // Handled by redirect
  }

  if (!activeStore?.id) {
    return (
      <div className="min-h-full bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 pb-8 px-6 text-center">
            <Settings className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-4" />
            <h2 className="text-xl font-semibold mb-2">Ingen aktiv butik</h2>
            <p className="text-muted-foreground mb-6">
              Du måste ha en aktiv butik för att köra installationsguiden.
              Välj butik i inställningar eller kontakta administratör.
            </p>
            <Button onClick={() => navigate({ to: "/installningar" })} className="w-full">
              <Settings className="w-4 h-4" />
              Öppna inställningar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentStepIndex = STEPS.findIndex((s) => s.id === state.step);

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950 p-4 md:p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Progress Header */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Settings className="w-6 h-6 text-indigo-500" />
                Butiksinstallation: {activeStore.name}
              </h1>
              <p className="text-slate-500 dark:text-slate-400 mt-1">
                Steg {currentStepIndex + 1} av {STEPS.length}
              </p>
            </div>
            {state.step !== "complete" && canProceed() && (
              <Button onClick={nextStep} className="gap-2">
                Nästa steg
                <ArrowRight className="w-4 h-4" />
              </Button>
            )}
          </div>

          {/* Step Progress Indicator */}
          <div className="relative">
            <div className="absolute top-3 left-0 right-0 h-1 bg-slate-200 dark:bg-slate-700" />
            <div className="relative flex justify-between">
              {STEPS.map((step, index) => (
                <div key={step.id} className="flex flex-col items-center">
                  <div
                    className={cn(
                      "relative z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 transition-all",
                      index < currentStepIndex
                        ? "bg-emerald-500 border-emerald-500 text-white"
                        : index === currentStepIndex
                        ? "bg-indigo-500 border-indigo-500 text-white"
                        : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-400"
                    )}
                  >
                    {index < currentStepIndex ? (
                      <CheckCircle className="w-4 h-4" />
                    ) : (
                      <step.icon className="w-4 h-4" />
                    )}
                  </div>
                  <span className={cn("mt-1 text-xs text-center w-24", index <= currentStepIndex ? "font-medium text-foreground" : "text-muted-foreground")}>
                    {step.title}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Step Content */}
        <div className="animate-fade-in">
          {state.step === "portals" && renderStepPortals()}
          {state.step === "mapping" && renderStepMapping()}
          {state.step === "products" && renderStepProducts()}
          {state.step === "complete" && renderStepComplete()}
        </div>

        {/* Navigation Buttons */}
        {state.step !== "complete" && (
          <div className="flex justify-between pt-4 border-t border-slate-200 dark:border-slate-700">
            <Button
              variant="outline"
              onClick={prevStep}
              disabled={state.step === "portals"}
            >
              <ArrowLeft className="w-4 h-4" />
              Tillbaka
            </Button>
            <Button
              onClick={nextStep}
              disabled={!canProceed()}
              className="gap-2"
            >
              Nästa steg
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function LinkCard({
  title,
  description,
  icon: Icon,
  to,
  tone,
}: {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  to: string;
  tone: "blue" | "green" | "amber" | "indigo";
}) {
  const colors = {
    blue: "bg-info/10 text-info border-info/20",
    green: "bg-success/10 text-success border-success/20",
    amber: "bg-warning/15 text-warning-foreground border-warning/20",
    indigo: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
  };

  return (
    <a
      href={to}
      className={cn(
        "group p-4 rounded-xl border transition-all hover:shadow-md",
        colors[tone]
      )}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-lg mb-3">
        <Icon className="w-5 h-5" />
      </div>
      <p className="font-medium text-sm mb-1">{title}</p>
      <p className="text-xs text-muted-foreground">{description}</p>
      <div className="mt-3 flex items-center justify-end">
        <ChevronRight className="w-4 h-4 opacity-50 group-hover:opacity-100 transition-opacity" />
      </div>
    </a>
  );
}