/**
 * Dashboard page for shelf life management
 * Shows all shelf life records and allows basic management
 */
import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { useEffect, useState } from "react";
import {
  Upload,
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
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/page-header";
import {
  parseDeliveryNoteExcel,
  matchDeliveryNoteToProducts,
  type DeliveryNoteRow,
  type ProductMatchResult,
} from "@/lib/excel-parser";
import { exportTextAsCSV } from "@/lib/csv";

type ShelfLifeRecord = {
  id: string;
  store_id: string;
  sap_article_id: string;
  shelf_lifetime_days: number;
  expiry_date: string;
  arrival_date: string;
  compensation_price_ore: number;
  created_at: string;
  updated_at: string;
};

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { user, activeStore, loading: authLoading } = useAuth();
  const [step, setStep] = useState<"import" | "manage" | "generate">("import");
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [deliveryNotes, setDeliveryNotes] = useState<DeliveryNoteRow[]>([]);
  const [matchResults, setMatchResults] = useState<ProductMatchResult[]>([]);
  const [shelfLifeRecords, setShelfLifeRecords] = useState<ShelfLifeRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<ShelfLifeRecord | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Load shelf life data on mount
  useEffect(() => {
    if (user && activeStore && step === "manage") {
      loadShelfLifeData();
    }
  }, [user, activeStore, step]);

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
          <p className="text-muted-foreground">Du måste vara inloggad för att komma åt datumkontrollen.</p>
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

  // Import handling
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setImportError(null);
    setImportSuccess(null);

    try {
      const parsed = await parseDeliveryNoteExcel(file);
      setDeliveryNotes(parsed.rows);
      setImportSuccess(`Importerade ${parsed.totalRows} rader från följesedeln`);

      // Auto-match products
      if (parsed.rows.length > 0) {
        const results = await matchDeliveryNoteToProducts(supabase, activeStore.id, parsed.rows);
        setMatchResults(results);
      }
    } catch (error) {
      console.error("Import error:", error);
      setImportError("Kunde inte importera filen. Kontrollera formatet.");
    } finally {
      setIsLoading(false);
    }
  };

  // Match products
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
      setImportSuccess(`Matchade ${results.filter((r) => r.product).length} produkter`);
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
        .eq("store_id", activeStore.id)
        .order("arrival_date", { ascending: true });

      if (error) throw error;
      setShelfLifeRecords(data || []);
    } catch (error) {
      console.error("Error loading shelf life:", error);
      setImportError("Kunde inte ladda hållbarhetsdata.");
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
      const { error } = await supabase.functions.invoke("set_shelf_life", record);

      if (error) throw error;
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
      const { data, error } = await supabase.functions.invoke("set_shelf_life", {
        body: {
          jsonrpc: "2.0",
          id: "1",
          method: "tools/call",
          params: {
            tool: "generate_shelf_life_zip",
            arguments: { store_id: activeStore.id },
          },
        },
      });

      if (error) throw error;

      const result = data?.result;
      if (result?.csv_data) {
        exportTextAsCSV(result.csv_data, `ersattningsansokning_${new Date().toISOString().split("T")[0]}.csv`);
      }
      setImportSuccess(`Genererade ersättningsfil med ${result?.flagged_count || 0} flaggade artiklar`);
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
        title="Datumkontroll"
        description="Hantera hållbarhetsdagar, datumregelverk och ersättningskrav"
      />

      {/* Step navigation */}
      <div className="flex gap-4 mb-6">
        <Button
          variant={step === "import" ? "default" : "outline"}
          onClick={() => setStep("import")}
        >
          <Upload size={16} className="mr-2" />
          1. Importera följesedel
        </Button>
        <Button
          variant={step === "manage" ? "default" : "outline"}
          onClick={() => setStep("manage")}
        >
          <Settings size={16} className="mr-2" />
          2. Hantera hållbarhetsdata
        </Button>
        <Button
          variant={step === "generate" ? "default" : "outline"}
          onClick={() => setStep("generate")}
        >
          <Download size={16} className="mr-2" />
          3. Generera ersättning
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
              Ladda upp en .xlsx-fil med leveransdata. Systemet matchar automatiskt mot befintliga
              produkter och skapar nya om det behövs.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="delivery-file">Följesedelsfil (.xlsx)</Label>
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
                        <TableHead className="text-right">Kvantitet</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {deliveryNotes.slice(0, 10).map((row, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-sm">{row.sapProduktId}</TableCell>
                          <TableCell>{row.bnr}</TableCell>
                          <TableCell>{row.produkt}</TableCell>
                          <TableCell>{row.leveransdag}</TableCell>
                          <TableCell>{row.bastForeDatum}</TableCell>
                          <TableCell className="text-right">{row.levereradKvantitet}</TableCell>
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

                {matchResults.length > 0 && (
                  <div className="border rounded-lg p-4 bg-secondary/20">
                    <h4 className="font-medium mb-2">Matchningsresultat</h4>
                    <p className="text-sm">
                      Matchade: {matchResults.filter((r) => r.product).length} av {matchResults.length}
                    </p>
                    <p className="text-sm">
                      Nya produkter att skapa: {matchResults.filter((r) => r.isNewProduct).length}
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2: Manage shelf life */}
      {step === "manage" && (
        <Card>
          <CardHeader>
            <CardTitle>Hållbarhetsdata</CardTitle>
            <CardDescription>
              Se och hantera hållbarhetsdagar för artiklar. Systemet beräknar automatiskt
              om produkterna omfattas av datumregelverket för ersättning.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {shelfLifeRecords.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Clock size={48} className="mx-auto mb-4 opacity-50" />
                <p>Ingen hållbarhetsdata registrerad än.</p>
                <p className="text-sm mt-2">Importera eller skapa produkter för att börja.</p>
              </div>
            ) : (
              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SAP Produkt-ID</TableHead>
                      <TableHead className="text-center">Hållbarhet (dagar)</TableHead>
                      <TableHead>Bäst-före-datum</TableHead>
                      <TableHead>Leveransdatum</TableHead>
                      <TableHead className="text-right">Kvarvarande</TableHead>
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
                          <TableCell className="text-center text-sm">
                            {record.shelf_lifetime_days}
                          </TableCell>
                          <TableCell className="text-sm">
                            {new Date(record.expiry_date).toLocaleDateString("sv-SE")}
                          </TableCell>
                          <TableCell className="text-sm">
                            {new Date(record.arrival_date).toLocaleDateString("sv-SE")}
                          </TableCell>
                          <TableCell className="text-right text-sm">{daysRemaining}</TableCell>
                          <TableCell>
                            {isFlagged ? (
                              <Badge variant="destructive" className="flex items-center gap-1 w-fit">
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
                              <ChevronRight size={16} />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 3: Generate compensation */}
      {step === "generate" && (
        <Card>
          <CardHeader>
            <CardTitle>Generera ersättningsansökan</CardTitle>
            <CardDescription>
              Skapa en zip-fil med artiklar som omfattas av datumregelverket för att skicka till
              Butikssupport.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Enligt Coop:s datumregelverk:
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>Varor med &le;18 m&aring;naders h&aring;llbarhet beh&ouml;ver &ge;50% kvar vid ankomst</li>
                  <li>Varor med &gt;18 m&aring;naders h&aring;llbarhet beh&ouml;ver &ge;9 m&aring;nader kvar vid ankomst</li>
                  <li>Färskvaror med &lt;25 dagar hanteras separat</li>
                </ul>
              </AlertDescription>
            </Alert>

            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">
                Systemet beräknar automatiskt vilka artiklar som omfattas av reglerna.
              </p>
              <Button onClick={generateCompensationZip} disabled={isLoading}>
                {isLoading ? "Genererar..." : "Generera ersättningsfil"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading overlay */}
      {isLoading && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="flex items-center gap-4 bg-background p-6 rounded-lg">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-primary border-t-transparent" />
            <span>Laddar...</span>
          </div>
        </div>
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
                    (form.elements.namedItem("shelf_lifetime_days") as HTMLInputElement).value
                  ),
                  expiry_date: (form.elements.namedItem("expiry_date") as HTMLInputElement).value,
                  arrival_date: (form.elements.namedItem("arrival_date") as HTMLInputElement).value,
                  compensation_price_ore:
                    parseInt(
                      (form.elements.namedItem("compensation_price_ore") as HTMLInputElement).value
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
    </div>
  );
}
