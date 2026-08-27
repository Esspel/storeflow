/**
 * Ersättningscheck Route
 * Hanterar följesedelimport, hållbarhetsdatum och ersättningskrav
 * Enligt Coops datumregelverk för produktförfall
 */

import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { useState, useEffect } from "react";
import {
  Upload,
  FileSpreadsheet,
  Table as TableIcon,
  RefreshCw,
  Settings,
  Download,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ChevronRight,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import {
  parseDeliveryNoteExcel,
  matchDeliveryNoteToProducts,
  type DeliveryNoteRow,
  type ProductMatchResult,
} from "@/lib/excel-parser";
import { exportTextAsCSV, downloadAsZip } from "@/lib/csv";
import { toast } from "sonner";

type ShelfLifeRecord = {
  id: string;
  sap_article_id: string;
  shelf_lifetime_days: number;
  expiry_date: string;
  arrival_date: string;
  compensation_price_ore: number;
  created_at: string;
  updated_at: string;
};

type WeeklyTask = {
  sap_article_id: string;
  name: string;
  ean: string;
  bnr: string;
  delivery_count: number;
};

type ReclamationStatus = "Ej skickad" | "Granskas av butikssupporten" | "Löst" | "Nekad";

type Reclamation = {
  id: string;
  sap_article_id: string;
  status: ReclamationStatus;
  created_at: string;
  updated_at: string;
  notes?: string;
};

export const Route = createFileRoute("/ersattningcheck")({
  component: ErstatningsCheckPage,
});

function ErstatningsCheckPage() {
  const { user, activeStore, loading: authLoading } = useAuth();
  const [step, setStep] = useState<"import" | "manage" | "generate" | "weekly" | "reclamations">(
    "import",
  );
  const [reclamations, setReclamations] = useState<Reclamation[]>([]);
  const [statusFilter, setStatusFilter] = useState<ReclamationStatus>("Ej skickad");
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [deliveryNotes, setDeliveryNotes] = useState<DeliveryNoteRow[]>([]);
  const [matchResults, setMatchResults] = useState<ProductMatchResult[]>([]);
  const [shelfLifeRecords, setShelfLifeRecords] = useState<ShelfLifeRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<ShelfLifeRecord | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [weeklyTask, setWeeklyTask] = useState<WeeklyTask[]>([]);
  const [selectedWeeklyProduct, setSelectedWeeklyProduct] = useState<WeeklyTask | null>(null);
  const [weeklyDays, setWeeklyDays] = useState("");

  const supabaseClient = supabase;

  // Check for auth/store
  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-foreground mb-2">Inloggning krävs</h2>
          <p className="text-muted-foreground">
            Du måste vara inloggad för att komma åt ersättnings-kontrollen.
          </p>
        </div>
      </div>
    );
  }

  if (!activeStore) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-foreground mb-2">Ingen aktiv butik</h2>
          <p className="text-muted-foreground">Välj en butik för att fortsätta.</p>
        </div>
      </div>
    );
  }

  // Handle file upload
  const handleFileUpload = async (fileOrEvent: File | React.ChangeEvent<HTMLInputElement>) => {
    const file = fileOrEvent instanceof File ? fileOrEvent : fileOrEvent.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setImportError(null);
    setImportSuccess(null);

    try {
      const parsed = await parseDeliveryNoteExcel(file);
      setDeliveryNotes(parsed.rows);
      setImportSuccess(`Importerade ${parsed.totalRows} artiklar`);
    } catch (error) {
      console.error("Import error:", error);
      setImportError("Kunde inte importera filen. Kontrollera formatet.");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle product matching
  const handleMatchProducts = async () => {
    if (deliveryNotes.length === 0) {
      setImportError("Ingen följesedel att matcha. Importera först.");
      return;
    }

    setIsLoading(true);
    setImportError(null);

    try {
      const results = await matchDeliveryNoteToProducts(supabase, activeStore.id, deliveryNotes);
      setMatchResults(results);

      // Auto-create unmatched products
      // Filtrera bort rader utan giltig EAN (null/empty) for att undvika products_ean_unique constraint-konflikt
      const newProducts = results
        .filter((r) => r.isNewProduct && (r.row.bnr || r.row.sapProduktId))
        .filter((r) => r.row.bnr && String(r.row.bnr).trim().length > 0)
        .map((r) => ({
          store_id: activeStore.id,
          sap_article_id: r.row.sapProduktId || null,
          ean: r.row.bnr ? String(r.row.bnr).trim() : null,
          bnr: r.row.bnr ? String(r.row.bnr).trim() : null,
          name: r.row.produkt || "Okänd produkt",
          brand: r.row.varumärke || null,
          size: r.row.innehåll || null,
          unit: r.row.beställningsenhet || null,
          category: r.row.kategori || null,
          updated_at: new Date().toISOString(),
        }));

      if (newProducts.length > 0) {
        // Deduplicera på bnr inom samma batch (21000-fix)
        const seenBnr = new Set();
        const deduped = newProducts.filter((p) => {
          const key = (p.bnr || p.store_id || "") + ":" + (p.sap_article_id || "");
          if (seenBnr.has(key)) return false;
          seenBnr.add(key);
          return true;
        });
        const { error: upsertErr } = await supabase
          .from("products")
          .upsert(deduped, { onConflict: "sap_article_id", ignoreDuplicates: false });

        if (upsertErr) {
          console.error("Upsert error:", upsertErr);
          throw upsertErr;
        }
      }

      setImportSuccess(
        `Matchade ${results.filter((r) => r.product).length} produkter. Skapade ${newProducts.length} nya.`,
      );
    } catch (error) {
      console.error("Match error:", error);
      setImportError("Kunde inte matcha produkter.");
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-load reclamations on mount and on step change
  useEffect(() => {
    if (step === "reclamations" && activeStore?.id) {
      supabase
        .from("reclamations")
        .select("*")
        .eq("store_id", activeStore.id)
        .limit(20)
        .then(({ data, error }) => {
          if (!error && data) setReclamations(data as Reclamation[]);
        });
    }
  }, [step, activeStore?.id]);

  // Auto-load reclamations on page mount
  useEffect(() => {
    if (!activeStore?.id) return;
    supabase
      .from("reclamations")
      .select("*")
      .eq("store_id", activeStore.id)
      .limit(20)
      .then(({ data, error }) => {
        if (!error && data) setReclamations(data as Reclamation[]);
      });
  }, [activeStore?.id]);

  // Load shelf life data
  const loadShelfLifeData = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("product_shelf_life")
        .select(
          "sap_article_id, shelf_lifetime_days, temperature_zone, default_compensation_price_ore",
        )
        .order("updated_at", { ascending: false })
        .limit(200);

      if (error) throw error;
      setShelfLifeRecords(
        (data ?? []).map((r: any) => ({
          id: r.sap_article_id ?? r.id,
          sap_article_id: r.sap_article_id ?? "",
          shelf_lifetime_days: r.shelf_lifetime_days ?? 0,
          expiry_date: "", // masterdata har inget expiry — leveranshistorik har det
          arrival_date: "",
          compensation_price_ore: r.default_compensation_price_ore ?? 2,
          created_at: r.created_at ?? new Date().toISOString(),
          updated_at: r.updated_at ?? new Date().toISOString(),
        })),
      );
    } catch (error) {
      console.error("Error loading shelf life:", error);
      setImportError("Kunde inte ladda hållbarhetsdata.");
    } finally {
      setIsLoading(false);
    }
  };

  // Load weekly task (products needing shelf life data)
  const loadWeeklyTask = async () => {
    setIsLoading(true);
    try {
      const { data: stats, error: dbErr } = await supabase
        .from("product_reclamation_stats")
        .select("*")
        .eq("store_id", activeStore.id);
      if (dbErr) throw dbErr;

      // Filter for products with 0 reklamationes / missing shelf life data
      const productsWithoutShelfLife = (stats || [])
        .filter((p) => p.reclamation_count === 0 && p.delivery_count > 0)
        .slice(0, 10);

      if (productsWithoutShelfLife.length === 0) {
        toast.info("Inga produkter saknar hållbarhetsdata i veckouppdraget");
        return;
      }

      setWeeklyTask(productsWithoutShelfLife);
      setStep("weekly");
    } catch (error) {
      console.error("Error loading weekly task:", error);
      toast.error("Kunde inte ladda veckouppdrag");
    } finally {
      setIsLoading(false);
    }
  };

  // Save weekly shelf-life updates directly to DB
  const saveWeeklyShelfLife = async (
    updates: Array<{ id: string; shelf_lifetime_days: number; expiry_date: string }>,
  ) => {
    setIsLoading(true);
    try {
      for (const u of updates) {
        // Skriv ny leveransrad till store_product_deliveries (inte upsert)
        await supabase.from("store_product_deliveries").insert({
          sap_article_id: u.id,
          store_id: activeStore.id,
          arrival_date: new Date().toISOString(),
          best_before_date: u.expiry_date,
          quantity: 0,
          status: "delivered",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        // Uppdatera masterdata om nödvändigt
        await supabase.from("product_shelf_life").upsert(
          {
            sap_article_id: u.id,
            shelf_lifetime_days: u.shelf_lifetime_days,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "sap_article_id" },
        );
      }
      toast.success("Hållbarhetsdata sparad.");
    } catch (e) {
      toast.error("Kunde inte spara hållbarhetsdata.");
    } finally {
      setIsLoading(false);
    }
  };

  // Save shelf life data
  const saveShelfLife = async (record: {
    sap_article_id: string;
    shelf_lifetime_days: number;
    expiry_date: string;
    arrival_date: string;
    compensation_price_ore?: number;
  }) => {
    setIsLoading(true);
    try {
      // Skriv leveransrad till store_product_deliveries (ny struktur)
      // Använd INSERT (inte UPSERT) så leveranshistorik skrivs inte över
      const { error: insertErr } = await supabase.from("store_product_deliveries").insert({
        sap_article_id: record.sap_article_id,
        store_id: activeStore.id,
        arrival_date: record.arrival_date,
        best_before_date: record.expiry_date,
        quantity: 0,
        status: "delivered",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      if (insertErr) throw insertErr;

      // Uppdatera masterdata (product_shelf_life) om det inte redan finns
      const { error: upsertErr } = await supabase.from("product_shelf_life").upsert(
        {
          sap_article_id: record.sap_article_id,
          shelf_lifetime_days: record.shelf_lifetime_days,
          default_compensation_price_ore: record.compensation_price_ore ?? 2,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "sap_article_id" },
      );
      if (upsertErr) throw upsertErr;

      setImportSuccess("Hållbarhetsdata sparad!");
      await loadShelfLifeData();
    } catch (error) {
      console.error("Error saving shelf life:", error);
      setImportError("Kunde inte spara hållbarhetsdata.");
    } finally {
      setIsLoading(false);
    }
  };

  // Generate compensation zip (.txt per leverans + temperaturzon)
  const generateCompensationZip = async () => {
    setIsLoading(true);
    try {
      // Läs leveranshistorik från store_product_deliveries (inte masterdata-tabellen)
      const { data: shelfData, error: dbErr } = await supabase
        .from("store_product_deliveries")
        .select("sap_article_id, best_before_date, arrival_date, quantity, status, delivery_number")
        .eq("store_id", activeStore.id)
        .lt("best_before_date", new Date().toISOString())
        .order("best_before_date", { ascending: true });

      if (dbErr) throw dbErr;
      const flagged = shelfData ?? [];
      if (flagged.length === 0) {
        setImportSuccess("Inga flaggade produkter för ersättningsansökan.");
        return;
      }

      // Hämta masterdata för shelf_lifetime_days och temperature_zone
      const { data: masterData, error: masterErr } = await supabase
        .from("product_shelf_life")
        .select(
          "sap_article_id, shelf_lifetime_days, temperature_zone, default_compensation_price_ore",
        );
      if (masterErr) throw masterErr;
      const masterMap = new Map((masterData ?? []).map((m: any) => [m.sap_article_id, m]));

      // Gruppera per leveransnummer + temperaturzon
      const groups: Record<string, Array<any>> = {};
      for (const r of flagged) {
        const master = masterMap.get(r.sap_article_id) || {};
        const leverans = r.delivery_number ? String(r.delivery_number) : "okand";
        const zon = (master as any)?.temperature_zone || "okand";
        const shelfDays = (master as any)?.shelf_lifetime_days || 0;
        const compPrice = (master as any)?.default_compensation_price_ore || 2;
        const key = `${leverans}__${zon}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push({
          ...r,
          shelf_lifetime_days: shelfDays,
          compensation_price_ore: compPrice,
          temperature_zone: zon,
        });
      }

      const files = Object.entries(groups).map(([key, rows]) => {
        const [leverans, zon] = key.split("__");
        const content = [
          `LEVERANS: ${leverans}`,
          `TEMPERATURZON: ${zon}`,
          `SAP_ARTIKEL_ID|HALLBARHET_DAGAR|UTGANGSDATUM|ANKOMST|ERSATTNING_ORE`,
          ...rows.map((row: any) =>
            [
              row.sap_article_id,
              row.shelf_lifetime_days,
              row.best_before_date?.split("T")[0] || row.best_before_date,
              row.arrival_date?.split("T")[0] || row.arrival_date,
              row.compensation_price_ore ?? 0,
            ].join("|"),
          ),
        ].join("\n");
        return { name: `ersattning_${leverans}_${zon}.txt`, content };
      });

      await downloadAsZip(
        files,
        `ersattningsansokan_${new Date().toISOString().split("T")[0]}.zip`,
      );
      setImportSuccess(
        `Genererade ZIP med ${files.length} .txt-fil(er), ${flagged.length} produkter.`,
      );
    } catch (error) {
      console.error("Error generating zip:", error);
      setImportError("Kunde inte generera ersättningsfil.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <PageHeader
        title="Ersättningskontroll"
        description="Hantera följesedel, hållbarhetsdatum och datumregelverk enligt Coop"
      />

      {/* Step navigation */}
      <div className="flex gap-4 mb-6 flex-wrap">
        <Button
          variant={step === "import" ? "default" : "outline"}
          onClick={() => setStep("import")}
          className="flex items-center gap-2"
        >
          <Upload size={16} />
          1. Importera följesedel
        </Button>
        <Button
          variant={step === "manage" ? "default" : "outline"}
          onClick={() => {
            setStep("manage");
            loadShelfLifeData();
          }}
          className="flex items-center gap-2"
        >
          <Settings size={16} />
          2. Hantera hållbarhetsdata
        </Button>
        <Button
          variant={step === "generate" ? "default" : "outline"}
          onClick={() => setStep("generate")}
          className="flex items-center gap-2"
        >
          <Download size={16} />
          3. Generera ersättning
        </Button>
        <Button
          variant={step === "weekly" ? "default" : "outline"}
          onClick={() => setStep("weekly")}
          className="flex items-center gap-2"
        >
          <Clock size={16} />
          4. Veckouppdrag
        </Button>
        <Button
          variant={step === "reclamations" ? "default" : "outline"}
          onClick={() => setStep("reclamations")}
          className="flex items-center gap-2"
        >
          <AlertTriangle size={16} />
          5. Hantera varor
        </Button>
      </div>

      {/* Alerts */}
      {importError && (
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{importError}</AlertDescription>
        </Alert>
      )}
      {importSuccess && (
        <Alert className="mb-4">
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>{importSuccess}</AlertDescription>
        </Alert>
      )}

      {/* Step 1: Import */}
      {step === "import" && (
        <Card>
          <CardHeader>
            <CardTitle>Importera följesedel</CardTitle>
            <CardDescription>
              Ladda upp följesedelsfilen (.xlsx) från leveransen. Systemet matchar automatiskt mot
              befintliga produkter och skapar nya om det behövs.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="delivery-file">Välj följesedelsfil</Label>
              <div
                className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer hover:border-blue-400 transition-colors bg-muted/30"
                onDrop={async (e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files?.[0];
                  if (
                    file &&
                    (file.name.endsWith(".xlsx") ||
                      file.name.endsWith(".xls") ||
                      file.name.endsWith(".csv"))
                  ) {
                    await handleFileUpload(file);
                  }
                }}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => document.getElementById("delivery-file")?.click()}
              >
                <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm font-medium">Dra och släpp Excel-filen här</p>
                <p className="text-xs text-muted-foreground mt-1">
                  eller klicka för att välja .xlsx / .xls / .csv
                </p>
              </div>
              <input
                id="delivery-file"
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleFileUpload}
                disabled={isLoading}
              />
            </div>

            {deliveryNotes.length > 0 && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-medium">Importerade {deliveryNotes.length} rader</h3>
                  <Button onClick={handleMatchProducts} disabled={isLoading}>
                    {isLoading ? "Matchar produkter..." : "Matcha produkter"}
                  </Button>
                </div>

                <div className="border rounded-lg overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Pallnummer</TableHead>
                        <TableHead>SAP Produkt-ID</TableHead>
                        <TableHead>BNR</TableHead>
                        <TableHead>Produkt</TableHead>
                        <TableHead>Varumärke</TableHead>
                        <TableHead>Innehåll</TableHead>
                        <TableHead>Beställningskvantitet</TableHead>
                        <TableHead>Beställningsenhet</TableHead>
                        <TableHead>Enhetsomvandling</TableHead>
                        <TableHead>Levererad kvantitet</TableHead>
                        <TableHead>Sann vikt (KG)</TableHead>
                        <TableHead>Leveransdag</TableHead>
                        <TableHead>Bäst-före-datum</TableHead>
                        <TableHead>Leveransstatus</TableHead>
                        <TableHead>Pris per enhet (SEK)</TableHead>
                        <TableHead>Totalpris (SEK)</TableHead>
                        <TableHead>Kategori</TableHead>
                        <TableHead>Förväntad kvantitet</TableHead>
                        <TableHead>Orderrad</TableHead>
                        <TableHead>Ordernummer</TableHead>
                        <TableHead>Leveransnummer</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {deliveryNotes.slice(0, 10).map((row, i) => (
                        <TableRow key={i}>
                          <TableCell className="whitespace-nowrap">{row.pallnummer}</TableCell>
                          <TableCell className="font-mono text-sm whitespace-nowrap">
                            {row.sapProduktId}
                          </TableCell>
                          <TableCell className="font-mono text-sm whitespace-nowrap">
                            {row.bnr}
                          </TableCell>
                          <TableCell className="whitespace-nowrap max-w-[200px] truncate">
                            {row.produkt}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{row.varumärke}</TableCell>
                          <TableCell className="whitespace-nowrap">{row.innehåll}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            {row.beställningskvantitet}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {row.beställningsenhet}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {row.enhetsomvandling}
                          </TableCell>
                          <TableCell align="right" className="whitespace-nowrap">
                            {row.levereradKvantitet}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{row.sannViktKg}</TableCell>
                          <TableCell className="whitespace-nowrap">{row.leveransdag}</TableCell>
                          <TableCell className="whitespace-nowrap">{row.bastForeDatum}</TableCell>
                          <TableCell className="whitespace-nowrap">{row.leveransstatus}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            {row.prisPerLeveransenhet}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{row.totalpris}</TableCell>
                          <TableCell className="whitespace-nowrap">{row.kategori}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            {row.förväntadKvantitet}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{row.orderrad}</TableCell>
                          <TableCell className="whitespace-nowrap">{row.ordernummer}</TableCell>
                          <TableCell className="whitespace-nowrap">{row.leveransnummer}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {deliveryNotes.length > 10 && (
                    <p className="text-sm text-muted-foreground text-center py-2">
                      Och {deliveryNotes.length - 10} fler rader...
                    </p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2: Manage shelf life */}
      {step === "manage" && (
        <Card>
          <CardHeader>
            <CardTitle>Hantera hållbarhetsdata</CardTitle>
            <CardDescription>
              Ange hållbarhetsdagar per artikel. Systemet beräknar automatiskt om produkter omfattas
              av datumregelverket för ersättning.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {shelfLifeRecords.length > 0 ? (
              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SAP Produkt-ID</TableHead>
                      <TableHead>Total hållbarhet (dagar)</TableHead>
                      <TableHead>Bäst-före-datum</TableHead>
                      <TableHead>Leveransdatum</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Åtgärder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shelfLifeRecords.map((record) => {
                      const arrival = new Date(record.arrival_date);
                      const expiry = new Date(record.expiry_date);
                      const daysRemaining = Math.floor(
                        (expiry.getTime() - arrival.getTime()) / (1000 * 60 * 60 * 24),
                      );

                      let minRequired: number;
                      if (record.shelf_lifetime_days <= 548) {
                        minRequired = Math.ceil(record.shelf_lifetime_days * 0.5);
                      } else {
                        minRequired = 274;
                      }

                      const isFlagged = daysRemaining < minRequired;

                      return (
                        <TableRow key={record.id}>
                          <TableCell className="font-mono text-sm">
                            {record.sap_article_id}
                          </TableCell>
                          <TableCell>{record.shelf_lifetime_days}</TableCell>
                          <TableCell>
                            {new Date(record.expiry_date).toLocaleDateString("sv-SE")}
                          </TableCell>
                          <TableCell>
                            {new Date(record.arrival_date).toLocaleDateString("sv-SE")}
                          </TableCell>
                          <TableCell>
                            {isFlagged ? (
                              <Badge variant="destructive" className="flex items-center gap-1">
                                <AlertTriangle size={12} />
                                Kräver ersättning
                              </Badge>
                            ) : (
                              <Badge variant="secondary">OK</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedRecord(record);
                                setIsDialogOpen(true);
                              }}
                            >
                              Redigera
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Clock size={48} className="mx-auto mb-4 opacity-50" />
                <p>Ingen hållbarhetsdata registrerad ännu.</p>
                <p className="text-sm mt-2">
                  Importera följesedel först för att få produkter att hantera.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Edit shelf life dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Redigera hållbarhet</DialogTitle>
            <DialogDescription>{selectedRecord?.sap_article_id}</DialogDescription>
          </DialogHeader>

          {selectedRecord && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.target as HTMLFormElement;
                await saveShelfLife({
                  sap_article_id: selectedRecord.sap_article_id,
                  shelf_lifetime_days: parseInt(
                    (form.elements.namedItem("shelf_lifetime_days") as HTMLInputElement).value,
                  ),
                  expiry_date: (form.elements.namedItem("expiry_date") as HTMLInputElement).value,
                  arrival_date: (form.elements.namedItem("arrival_date") as HTMLInputElement).value,
                  compensation_price_ore:
                    parseInt(
                      (form.elements.namedItem("compensation_price_ore") as HTMLInputElement).value,
                    ) || 2,
                });
                setIsDialogOpen(false);
              }}
              className="space-y-4"
            >
              <div>
                <Label>Hållbarhet (dagar)</Label>
                <Input
                  name="shelf_lifetime_days"
                  type="number"
                  defaultValue={selectedRecord.shelf_lifetime_days}
                  required
                />
              </div>
              <div>
                <Label>Bäst-före-datum</Label>
                <Input
                  name="expiry_date"
                  type="date"
                  defaultValue={selectedRecord.expiry_date.split("T")[0]}
                  required
                />
              </div>
              <div>
                <Label>Leveransdatum</Label>
                <Input
                  name="arrival_date"
                  type="date"
                  defaultValue={selectedRecord.arrival_date.split("T")[0]}
                  required
                />
              </div>
              <div>
                <Label>Ersättningspris (öre)</Label>
                <Input
                  name="compensation_price_ore"
                  type="number"
                  defaultValue={selectedRecord.compensation_price_ore}
                  required
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={isLoading}>
                  Spara
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Step 3: Generate compensation */}
      {step === "generate" && (
        <Card>
          <CardHeader>
            <CardTitle>Generera ersättningsansökan</CardTitle>
            <CardDescription>
              Skapa en ZIP-fil med produkter som omfattas av datumregelverket för ersättning hos
              Butikssupport.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Enligt Coop:s regelverk:
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>Varor med ≤18 månaders hållbarhet behöver ≥50% kvar vid ankomst</li>
                  <li>Varor med &gt;18 månaders hållbarhet behöver ≥9 månader kvar vid ankomst</li>
                  <li>Undantagsartiklar med kortare hållbarhet hanteras separat</li>
                </ul>
              </AlertDescription>
            </Alert>

            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">
                Systemet kommer att generera en fil med alla produkter som kräver ersättning.
              </p>
              <Button onClick={generateCompensationZip} disabled={isLoading}>
                {isLoading ? "Genererar fil..." : "Generera ersättningsfil"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Weekly task */}
      {step === "weekly" && (
        <Card>
          <CardHeader>
            <CardTitle>Veckouppdrag</CardTitle>
            <CardDescription>
              Produkter som saknar hållbarhetsdata och behöver fyllas i.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {weeklyTask.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Clock size={48} className="mx-auto mb-4 opacity-50" />
                <p>Inga produkter att hantera.</p>
              </div>
            ) : (
              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SAP-ID</TableHead>
                      <TableHead>Produktnamn</TableHead>
                      <TableHead>EAN</TableHead>
                      <TableHead>BNR</TableHead>
                      <TableHead>Leveranser</TableHead>
                      <TableHead className="text-right">Åtgärder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {weeklyTask.map((product) => (
                      <TableRow key={product.sap_article_id}>
                        <TableCell className="font-mono text-sm">
                          {product.sap_article_id}
                        </TableCell>
                        <TableCell>{product.name}</TableCell>
                        <TableCell>{product.ean || "-"}</TableCell>
                        <TableCell>{product.bnr || "-"}</TableCell>
                        <TableCell className="text-center">{product.delivery_count}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedWeeklyProduct(product)}
                          >
                            Ange hållbarhet
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 5: Reclamation status / Hantera varor */}
      {step === "reclamations" && (
        <Card>
          <CardHeader>
            <CardTitle>Hantera varor — Reklamationsstatus</CardTitle>
            <CardDescription>
              Uppdatera status per reklamation. Spara direkt till Supabase (reclamations-tabell).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2 overflow-x-auto pb-2">
              {(
                [
                  "Ej skickad",
                  "Granskas av butikssupporten",
                  "Löst",
                  "Nekad",
                ] as ReclamationStatus[]
              ).map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={statusFilter === s ? "default" : "outline"}
                  onClick={() => setStatusFilter(s)}
                >
                  {s}
                </Button>
              ))}
            </div>
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SAP-ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Uppdaterad</TableHead>
                    <TableHead>Åtgärder</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reclamations
                    .filter((r) => (statusFilter ? r.status === statusFilter : true))
                    .map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-sm">{r.sap_article_id}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              r.status === "Löst"
                                ? "default"
                                : r.status === "Nekad"
                                  ? "destructive"
                                  : "secondary"
                            }
                          >
                            {r.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(r.updated_at).toLocaleDateString("sv-SE")}
                        </TableCell>
                        <TableCell>
                          {(
                            [
                              "Ej skickad",
                              "Granskas av butikssupporten",
                              "Löst",
                              "Nekad",
                            ] as ReclamationStatus[]
                          ).map((s) => (
                            <Button
                              key={s}
                              size="sm"
                              variant={r.status === s ? "default" : "outline"}
                              onClick={async () => {
                                await supabase
                                  .from("reclamations")
                                  .update({ status: s, updated_at: new Date().toISOString() })
                                  .eq("id", r.id);
                                setReclamations((prev) =>
                                  prev.map((x) =>
                                    x.id === r.id
                                      ? { ...x, status: s, updated_at: new Date().toISOString() }
                                      : x,
                                  ),
                                );
                              }}
                              className="mr-1 text-[10px]"
                            >
                              {s}
                            </Button>
                          ))}
                        </TableCell>
                      </TableRow>
                    ))}
                  {reclamations.filter((r) => (statusFilter ? r.status === statusFilter : true))
                    .length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="text-center text-sm text-muted-foreground py-6"
                      >
                        Inga reklamationer med denna status.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Weekly task dialog */}
      <Dialog
        open={!!selectedWeeklyProduct}
        onOpenChange={(open) => !open && setSelectedWeeklyProduct(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ange hållbarhetsdata</DialogTitle>
            <DialogDescription>{selectedWeeklyProduct?.sap_article_id}</DialogDescription>
          </DialogHeader>

          {selectedWeeklyProduct && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.target as HTMLFormElement;
                await saveShelfLife({
                  sap_article_id: selectedWeeklyProduct.sap_article_id,
                  shelf_lifetime_days: parseInt(
                    (form.elements.namedItem("shelf_lifetime_days") as HTMLInputElement).value,
                  ),
                  expiry_date: (form.elements.namedItem("expiry_date") as HTMLInputElement).value,
                  arrival_date: (form.elements.namedItem("arrival_date") as HTMLInputElement).value,
                  compensation_price_ore:
                    parseInt(
                      (form.elements.namedItem("compensation_price_ore") as HTMLInputElement).value,
                    ) || 2,
                });
                setSelectedWeeklyProduct(null);
              }}
              className="space-y-4"
            >
              <div>
                <Label>Hållbarhet (dagar)</Label>
                <Input name="shelf_lifetime_days" type="number" placeholder="T.ex. 365" required />
              </div>
              <div>
                <Label>Bäst-före-datum</Label>
                <Input name="expiry_date" type="date" required />
              </div>
              <div>
                <Label>Leveransdatum</Label>
                <Input name="arrival_date" type="date" required />
              </div>
              <div>
                <Label>Ersättningspris (öre)</Label>
                <Input name="compensation_price_ore" type="number" defaultValue={2} required />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={isLoading}>
                  Spara
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
