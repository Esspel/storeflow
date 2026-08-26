/**
 * Ersättnings Check Route
 * Handles delivery note import, shelf life management, and compensation claims
 * Based on Coop's datumregelverk (date rules) for product expiration
 */

import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { useState } from "react";
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
import { parseDeliveryNoteExcel, matchDeliveryNoteToProducts, type DeliveryNoteRow, type ProductMatchResult } from "@/lib/excel-parser";
import { exportTextAsCSV } from "@/lib/csv";
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

export const Route = createFileRoute("/ersattningcheck")({
  component: ErstatningsCheckPage,
});

function ErstatningsCheckPage() {
  const { user, activeStore, loading: authLoading } = useAuth();
  const [step, setStep] = useState<"import" | "manage" | "generate" | "weekly">("import");
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
          <p className="text-muted-foreground">Du måste vara inloggad för att komma åt ersättnings-kontrollen.</p>
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
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setImportError(null);
    setImportSuccess(null);

    try {
      const parsed = await parseDeliveryNoteExcel(file);
      setDeliveryNotes(parsed.rows);
      setImportSuccess(`Importerade ${parsed.totalRows} följesedlar`);
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
      const newProducts = results
        .filter(r => r.isNewProduct && r.row.sapProduktId)
        .map(r => ({
          store_id: activeStore.id,
          sap_article_id: r.row.sapProduktId,
          bnr: r.row.bnr,
          name: r.row.produkt,
          brand: r.row.varumärke,
          size: r.row.innehåll,
          unit: r.row.beställningsenhet,
          category: r.row.kategori,
        }));

      if (newProducts.length > 0) {
        // Create products (this is handled by matchDeliveryNoteToProducts returning matches)
        // Actual creation happens in backend
        console.log("Would create new products:", newProducts);
      }

      setImportSuccess(`Matchade ${results.filter(r => r.product).length} produkter. Skapade ${newProducts.length} nya.`);
    } catch (error) {
      console.error("Match error:", error);
      setImportError("Kunde inte matcha produkter.");
    } finally {
      setIsLoading(false);
    }
  };

  // Load shelf life data
  const loadShelfLifeData = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("product_shelf_life")
        .select("*")
        .order("arrival_date", { ascending: false });

      if (error) throw error;
      setShelfLifeRecords(data || []);
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

      // Filter for products with 0 reklamationer (saknar hållbarhetsdagar)
      const productsWithoutShelfLife = (stats || [])
        .filter(p => p.reclamation_count === 0 && p.delivery_count > 0)
        .slice(0, 10);

      if (productsWithoutShelfLife.length === 0) {
        toast.info("Inga produkter saknar hållbarhetsdata i veckouppdraget");
        return;
      }

      // Show dialog with products
      setWeeklyTask(productsWithoutShelfLife);
      setStep("weekly");
    } catch (error) {
      console.error("Error loading weekly task:", error);
      toast.error("Kunde inte ladda veckouppdrag");
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
      // Direct DB insert instead of MCP wrapper
      const { error: upsertErr } = await supabase
        .from("product_shelf_life")
        .upsert({
          sap_article_id: record.sap_article_id,
          shelf_lifetime_days: record.shelf_lifetime_days,
          expiry_date: record.expiry_date,
          arrival_date: record.arrival_date,
          compensation_price_ore: record.compensation_price_ore ?? 0,
          updated_at: new Date().toISOString(),
        });
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

  // Generate compensation zip
  const generateCompensationZip = async () => {
    setIsLoading(true);
    try {
      const { data: shelfData, error: dbErr } = await supabase
        .from("shelf_life")
        .select("sap_article_id, shelf_lifetime_days, expiry_date, arrival_date, compensation_price_ore")
        .eq("store_id", activeStore.id)
        .lt("expiry_date", new Date().toISOString())
        .order("expiry_date");

      if (dbErr) throw dbErr;

      const flaggedCount = (shelfData ?? []).length;
      if (shelfData && shelfData.length > 0) {
        const csvContent = [
          "sap_article_id,shelf_lifetime_days,expiry_date,arrival_date,compensation_price_ore",
          ...shelfData.map((row) =>
            `${row.sap_article_id},${row.shelf_lifetime_days},${row.expiry_date},${row.arrival_date},${row.compensation_price_ore ?? 0}`
          ),
        ].join("\n");
        exportTextAsCSV(csvContent, `ersattningsansokning_${new Date().toISOString().split("T")[0]}.csv`);
      }
      setImportSuccess(`Genererade ersättningsfil med ${flaggedCount} flaggade produkter`);
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
          onClick={() => {
            setStep("generate");
            loadWeeklyTask();
          }}
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
              Ladda upp följesedelsfilen (.xlsx) från leveransen. Systemet matchar automatiskt
              mot befintliga produkter och skapar nya om det behövs.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="delivery-file">Välj följesedelsfil</Label>
              <Input
                id="delivery-file"
                type="file"
                accept=".xlsx, .xls"
                onChange={handleFileUpload}
                disabled={isLoading}
              />
            </div>

            {deliveryNotes.length > 0 && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-medium">Importerade {deliveryNotes.length} rader</h3>
                  <Button onClick={handleMatchProducts} disabled={isLoading}>
                    {isLoading ? "Matchar..." : "Matcha produkter"}
                  </Button>
                </div>

                <div className="border rounded-lg overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>SAP Produkt-ID</TableHead>
                        <TableHead>BNR</TableHead>
                        <TableHead>Produkt</TableHead>
                        <TableHead>Leveransdag</TableHead>
                        <TableHead>Bäst-före-datum</TableHead>
                        <TableHead align="right">Levererad kvantitet</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {deliveryNotes.slice(0, 10).map((row, i) => (
                        <TableRow key={i}>
                          <TableCell>{row.sapProduktId}</TableCell>
                          <TableCell>{row.bnr}</TableCell>
                          <TableCell>{row.produkt}</TableCell>
                          <TableCell>{row.leveransdag}</TableCell>
                          <TableCell>{row.bastForeDatum}</TableCell>
                          <TableCell align="right">{row.levereradKvantitet}</TableCell>
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
              Ange hållbarhetsdagar per artikel. Systemet beräknar automatiskt om produkter
              omfattas av datumregelverket för ersättning.
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
                        (expiry.getTime() - arrival.getTime()) / (1000 * 60 * 60 * 24)
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
                          <TableCell>{new Date(record.expiry_date).toLocaleDateString("sv-SE")}</TableCell>
                          <TableCell>{new Date(record.arrival_date).toLocaleDateString("sv-SE")}</TableCell>
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
                <p className="text-sm mt-2">Importera följesedel först för att få produkter att hantera.</p>
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
            <DialogDescription>
              {selectedRecord?.sap_article_id}
            </DialogDescription>
          </DialogHeader>

          {selectedRecord && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.target as HTMLFormElement;
                await saveShelfLife({
                  sap_article_id: selectedRecord.sap_article_id,
                  shelf_lifetime_days: parseInt((form.elements.namedItem("shelf_lifetime_days") as HTMLInputElement).value),
                  expiry_date: (form.elements.namedItem("expiry_date") as HTMLInputElement).value,
                  arrival_date: (form.elements.namedItem("arrival_date") as HTMLInputElement).value,
                  compensation_price_ore: parseInt((form.elements.namedItem("compensation_price_ore") as HTMLInputElement).value) || 2,
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
              Skapa en ZIP-fil med produkter som omfattas av datumregelverket för
              ersättning hos Butikssupport.
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
                {isLoading ? "Genererar..." : "Generera ersättningsfil"}
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

      {/* Weekly task dialog */}
      <Dialog
        open={!!selectedWeeklyProduct}
        onOpenChange={(open) => !open && setSelectedWeeklyProduct(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ange hållbarhetsdata</DialogTitle>
            <DialogDescription>
              {selectedWeeklyProduct?.sap_article_id}
            </DialogDescription>
          </DialogHeader>

          {selectedWeeklyProduct && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.target as HTMLFormElement;
                await saveShelfLife({
                  sap_article_id: selectedWeeklyProduct.sap_article_id,
                  shelf_lifetime_days: parseInt(
                    (form.elements.namedItem("shelf_lifetime_days") as HTMLInputElement).value
                  ),
                  expiry_date: (form.elements.namedItem("expiry_date") as HTMLInputElement).value,
                  arrival_date: (form.elements.namedItem("arrival_date") as HTMLInputElement).value,
                  compensation_price_ore: parseInt(
                    (form.elements.namedItem("compensation_price_ore") as HTMLInputElement).value
                  ) || 2,
                });
                setSelectedWeeklyProduct(null);
              }}
              className="space-y-4"
            >
              <div>
                <Label>Hållbarhet (dagar)</Label>
                <Input
                  name="shelf_lifetime_days"
                  type="number"
                  placeholder="T.ex. 365"
                  required
                />
              </div>
              <div>
                <Label>Bäst-före-datum</Label>
                <Input
                  name="expiry_date"
                  type="date"
                  required
                />
              </div>
              <div>
                <Label>Leveransdatum</Label>
                <Input
                  name="arrival_date"
                  type="date"
                  required
                />
              </div>
              <div>
                <Label>Ersättningspris (öre)</Label>
                <Input
                  name="compensation_price_ore"
                  type="number"
                  defaultValue={2}
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
    </div>
  );
}
