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
  ExternalLink,
  BarChart3,
  Box,
  Package,
  TrendingDown,
  TrendingUp,
  Zap,
  Link2,
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
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type ShelfLifeRecord = {
  id: string;
  sap_article_id: string;
  shelf_lifetime_days: number;
  expiry_date: string;
  arrival_date: string;
  compensation_price_ore: number;
  created_at: string;
  updated_at: string;
  product_name: string;
  brand: string;
  product_url: string | null;
  delivery_status: string;
};

type DeliveryStatistic = {
  sap_article_id: string;
  product_name: string;
  brand: string;
  arrival_date: string | null;
  expiry_date: string | null;
  delivery_status: string;
};

type ReplacementStatistics = {
  returnedValue: number;
  pendingValue: number;
  sentCount: number;
  approvalRate: number;
  decidedCount: number;
  approvedCount: number;
  totalCount: number;
  monthly: Array<{ month: string; value: number; count: number }>;
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

function isDelivered(status: string | null | undefined) {
  const normalized = String(status ?? "").trim().toLowerCase();
  return normalized === "levererad" || normalized === "delivered";
}

function getSapProductUrl(storeNumber: string | null | undefined, sapArticleId: string) {
  if (!storeNumber || !sapArticleId) return null;
  return `https://s4r.sap.coop.se/sap/bc/ui2/flp?sap-client=100&sap-language=SV#Article-manage&/Store/${encodeURIComponent(storeNumber)}/Product/${encodeURIComponent(sapArticleId)}`;
}

export const Route = createFileRoute("/ersattningcheck")({
  component: ErstatningsCheckPage,
});

function ErstatningsCheckPage() {
  const { user, activeStore, loading: authLoading } = useAuth();
  const [step, setStep] = useState<
    "dashboard" | "import" | "manage" | "generate" | "weekly" | "reclamations" | "statistics"
  >(
    "dashboard",
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
  const [deliveryStatistics, setDeliveryStatistics] = useState<DeliveryStatistic[]>([]);
  const [replacementStatistics, setReplacementStatistics] = useState<ReplacementStatistics | null>(null);
  const [statisticsView, setStatisticsView] = useState<"value" | "count">("value");
  const [totalProductCount, setTotalProductCount] = useState(0);

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

  const flaggedProductCount = shelfLifeRecords.filter((record) => {
    if (!record.arrival_date || !record.expiry_date || record.shelf_lifetime_days <= 0) return false;
    const arrival = new Date(record.arrival_date).getTime();
    const expiry = new Date(record.expiry_date).getTime();
    if (Number.isNaN(arrival) || Number.isNaN(expiry)) return false;
    const daysRemaining = Math.floor((expiry - arrival) / (1000 * 60 * 60 * 24));
    const minimumDays = record.shelf_lifetime_days <= 548
      ? Math.ceil(record.shelf_lifetime_days * 0.5)
      : 274;
    return daysRemaining < minimumDays;
  }).length;
  const goodProductCount = Math.max(totalProductCount - flaggedProductCount, 0);
  const productPercentage = totalProductCount > 0
    ? Math.round((goodProductCount / totalProductCount) * 100)
    : 0;

  // Handle file upload
  const handleFileUpload = async (fileOrEvent: File | React.ChangeEvent<HTMLInputElement>) => {
    const file = fileOrEvent instanceof File ? fileOrEvent : fileOrEvent.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setImportError("Endast .xlsx-filer kan laddas upp.");
      return;
    }

    setIsLoading(true);
    setImportError(null);
    setImportSuccess(null);

    try {
      const parsed = await parseDeliveryNoteExcel(file);
      setDeliveryNotes(parsed.rows);
      await handleMatchProducts(parsed.rows);
      setImportSuccess(`Importerade och sparade ${parsed.totalRows} artiklar`);
    } catch (error) {
      console.error("Import error:", error);
      setImportError("Kunde inte importera filen. Kontrollera formatet.");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle product matching
  const handleMatchProducts = async (rows = deliveryNotes) => {
    if (rows.length === 0) {
      setImportError("Ingen följesedel att matcha. Importera först.");
      return;
    }

    setIsLoading(true);
    setImportError(null);

    try {
      const results = await matchDeliveryNoteToProducts(supabase, activeStore.id, rows);
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

      const deliveryRows = results
        .map((result) => ({
          sap_article_id: result.row.sapProduktId?.trim(),
          store_id: activeStore.id,
          arrival_date: result.row.leveransdag,
          best_before_date: result.row.bastForeDatum,
          quantity: Number.parseInt(result.row.levereradKvantitet, 10) || 0,
          status: result.row.leveransstatus || "delivered",
          delivery_number: result.row.leveransnummer || null,
          order_number: result.row.ordernummer || null,
          order_line: result.row.orderrad || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          pallet_number: result.row.pallnummer || null,
          product_name: result.row.produkt || null,
          brand: result.row.varumärke || null,
          bnr: result.row.bnr || null,
          content: result.row.innehåll || null,
          order_quantity: result.row.beställningskvantitet || null,
          order_unit: result.row.beställningsenhet || null,
          unit_conversion: result.row.enhetsomvandling || null,
          actual_weight_kg: result.row.sannViktKg || null,
          price_per_delivery_unit: result.row.prisPerLeveransenhet || null,
          total_price: result.row.totalpris || null,
          category: result.row.kategori || null,
          expected_quantity: result.row.förväntadKvantitet || null,
          delivery_status: result.row.leveransstatus || null,
        }))
        .filter((row) => row.sap_article_id);

      if (deliveryRows.length > 0) {
        const { error: deliveryError } = await supabase
          .from("store_product_deliveries")
          .insert(deliveryRows);
        if (deliveryError) throw deliveryError;
      }

      await loadShelfLifeData();
      setStep("manage");

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

  useEffect(() => {
    if (!activeStore?.id) return;
    void (async () => {
      await loadShelfLifeData();
      const { count } = await supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("store_id", activeStore.id);
      setTotalProductCount(count ?? 0);
    })();
  }, [activeStore?.id]);

  // Load shelf life data
  const loadShelfLifeData = async () => {
    setIsLoading(true);
    try {
      const [productsResult, masterResult, deliveriesResult] = await Promise.all([
        supabase
          .from("products")
          .select("id, sap_article_id, name, brand")
          .eq("store_id", activeStore.id)
          .not("sap_article_id", "is", null)
          .limit(500),
        supabase
          .from("product_shelf_life")
          .select("sap_article_id, shelf_lifetime_days, default_compensation_price_ore")
          .limit(500),
        supabase
          .from("store_product_deliveries")
          .select("id, sap_article_id, best_before_date, arrival_date, status, delivery_number, product_name, brand")
          .eq("store_id", activeStore.id)
          .order("arrival_date", { ascending: false })
          .limit(1000),
      ]);

      if (productsResult.error) throw productsResult.error;
      if (masterResult.error) throw masterResult.error;
      if (deliveriesResult.error) throw deliveriesResult.error;

      const masterMap = new Map(
        (masterResult.data ?? []).map((record: any) => [record.sap_article_id, record]),
      );
      const latestDelivery = new Map<string, any>();
      for (const delivery of deliveriesResult.data ?? []) {
        if (
          !latestDelivery.has(delivery.sap_article_id) &&
          delivery.best_before_date &&
          isDelivered(delivery.status)
        ) {
          latestDelivery.set(delivery.sap_article_id, delivery);
        }
      }

      setShelfLifeRecords(
        (productsResult.data ?? [])
          .filter((product: any) => latestDelivery.has(product.sap_article_id))
          .map((product: any) => {
          const master = masterMap.get(product.sap_article_id) ?? {};
          const delivery = latestDelivery.get(product.sap_article_id) ?? {};
          return {
            id: delivery.id ?? product.id,
            sap_article_id: product.sap_article_id,
            shelf_lifetime_days: master.shelf_lifetime_days ?? 0,
            expiry_date: delivery.best_before_date ?? "",
            arrival_date: delivery.arrival_date ?? "",
            compensation_price_ore: master.default_compensation_price_ore ?? 2,
            product_name: product.name ?? delivery.product_name ?? "Okänd produkt",
            brand: product.brand ?? delivery.brand ?? "",
            product_url: getSapProductUrl(activeStore.sap_site_id, product.sap_article_id),
            delivery_status: delivery.status ?? "",
            created_at: product.created_at ?? new Date().toISOString(),
            updated_at: product.updated_at ?? new Date().toISOString(),
          };
          }),
      );
    } catch (error) {
      console.error("Error loading shelf life:", error);
      setImportError("Kunde inte ladda hållbarhetsdata.");
    } finally {
      setIsLoading(false);
    }
  };

  const loadDeliveryStatistics = async () => {
    setIsLoading(true);
    try {
      const [{ data, error }, { data: reclamationData, error: reclamationError }] = await Promise.all([
        supabase
        .from("store_product_deliveries")
        .select("sap_article_id, product_name, brand, arrival_date, best_before_date, status")
        .eq("store_id", activeStore.id)
        .order("arrival_date", { ascending: false }),
        supabase
          .from("reclamations")
          .select("status, created_at")
          .eq("store_id", activeStore.id),
      ]);
      if (error) throw error;
      if (reclamationError) throw reclamationError;
      setDeliveryStatistics(
        (data ?? []).map((row: any) => ({
          sap_article_id: row.sap_article_id,
          product_name: row.product_name || "Okänd produkt",
          brand: row.brand || "",
          arrival_date: row.arrival_date,
          expiry_date: row.best_before_date,
          delivery_status: row.status || "",
        })),
      );
      const reclamationsForPeriod = (reclamationData ?? []).filter((row: any) => {
        const createdAt = new Date(row.created_at);
        return createdAt.getFullYear() === new Date().getFullYear();
      });
      const totalCount = reclamationsForPeriod.length;
      const sentCount = reclamationsForPeriod.filter((row: any) => row.status !== "Ej skickad").length;
      const decidedCount = reclamationsForPeriod.filter((row: any) => ["Löst", "Nekad"].includes(row.status)).length;
      const approvedCount = reclamationsForPeriod.filter((row: any) => row.status === "Löst").length;
      const monthly = Array.from({ length: 12 }, (_, month) => ({
        month: new Date(2000, month, 1).toLocaleDateString("sv-SE", { month: "short" }),
        value: 0,
        count: reclamationsForPeriod.filter((row: any) => new Date(row.created_at).getMonth() === month).length,
      }));
      setReplacementStatistics({
        returnedValue: 0,
        pendingValue: 0,
        sentCount,
        approvalRate: decidedCount === 0 ? 0 : Math.round((approvedCount / decidedCount) * 100),
        decidedCount,
        approvedCount,
        totalCount,
        monthly,
      });
      setStep("statistics");
    } catch (error) {
      console.error("Error loading delivery statistics:", error);
      setImportError("Kunde inte ladda leveranshistoriken.");
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
  }) => {
    setIsLoading(true);
    try {
      const { error: upsertErr } = await supabase.from("product_shelf_life").upsert(
        {
          sap_article_id: record.sap_article_id,
          shelf_lifetime_days: record.shelf_lifetime_days,
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
        .select(
          "sap_article_id, best_before_date, arrival_date, quantity, status, delivery_number, product_name, brand",
        )
        .eq("store_id", activeStore.id)
        .order("arrival_date", { ascending: false });

      if (dbErr) throw dbErr;
      const latestByArticle = new Map<string, (typeof shelfData)[number]>();
      for (const delivery of shelfData ?? []) {
        if (
          !latestByArticle.has(delivery.sap_article_id) &&
          delivery.best_before_date &&
          isDelivered(delivery.status)
        ) {
          latestByArticle.set(delivery.sap_article_id, delivery);
        }
      }
      const flagged = Array.from(latestByArticle.values()).filter(
        (delivery) => new Date(delivery.best_before_date).getTime() < Date.now(),
      );
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
      const { data: products, error: productsErr } = await supabase
        .from("products")
        .select("sap_article_id, name, brand")
        .eq("store_id", activeStore.id);
      if (productsErr) throw productsErr;
      const productMap = new Map((products ?? []).map((p: any) => [p.sap_article_id, p]));

      // Gruppera per leveransnummer + temperaturzon
      const groups: Record<string, Array<any>> = {};
      for (const r of flagged) {
        const master = masterMap.get(r.sap_article_id) || {};
        const leverans = r.delivery_number ? String(r.delivery_number) : "okand";
        const zon = (master as any)?.temperature_zone || "okand";
        const shelfDays = (master as any)?.shelf_lifetime_days || 0;
        const compPrice = (master as any)?.default_compensation_price_ore || 2;
        const product = productMap.get(r.sap_article_id) || {};
        const key = `${leverans}__${zon}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push({
          ...r,
          shelf_lifetime_days: shelfDays,
          compensation_price_ore: compPrice,
          temperature_zone: zon,
          product_name: product.name || r.product_name || "Okänd produkt",
          brand: product.brand || r.brand || "",
          reason: "Bäst-före-datum passerat",
        });
      }

      const files = Object.entries(groups).map(([key, rows]) => {
        const [leverans, zon] = key.split("__");
        const content = [
          `LEVERANS: ${leverans}`,
          `TEMPERATURZON: ${zon}`,
          `SAP_ARTIKEL_ID|PRODUKT|VARUMARKE|HALLBARHET_DAGAR|UTGANGSDATUM|ANKOMST|ANLEDNING|ERSATTNING_ORE`,
          ...rows.map((row: any) =>
            [
              row.sap_article_id,
              row.product_name,
              row.brand,
              row.shelf_lifetime_days,
              row.best_before_date?.split("T")[0] || row.best_before_date,
              row.arrival_date?.split("T")[0] || row.arrival_date,
              row.reason,
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
          variant={step === "dashboard" ? "default" : "outline"}
          onClick={() => setStep("dashboard")}
          className="flex items-center gap-2"
        >
          <Package size={16} />
          Översikt
        </Button>
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
          variant={step === "reclamations" ? "default" : "outline"}
          onClick={() => setStep("reclamations")}
          className="flex items-center gap-2"
        >
          <AlertTriangle size={16} />
          4. Hantera varor
        </Button>
        <Button
          variant={step === "statistics" ? "default" : "outline"}
          onClick={loadDeliveryStatistics}
          className="flex items-center gap-2"
        >
          <BarChart3 size={16} />
          5. Statistik
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

      {step === "dashboard" && (
        <div className="space-y-6">
          <section className="rounded-2xl bg-emerald-700 p-6 text-white shadow-sm md:p-8">
            <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
              <div>
                <p className="text-sm font-medium uppercase tracking-wide text-emerald-100">
                  {new Date().toLocaleDateString("sv-SE", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })}
                </p>
                <h2 className="mt-2 text-4xl font-semibold">Hej!</h2>
              </div>
              <div className="border-l border-emerald-500 pl-6 md:min-w-48">
                <p className="text-sm text-emerald-100">Totalt i systemet</p>
                <p className="mt-1 text-3xl font-semibold">{totalProductCount} produkter</p>
              </div>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <Card className="border-blue-200 bg-blue-50/70">
              <CardContent className="flex gap-4 p-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
                  <Zap size={20} />
                </div>
                <div>
                  <CardTitle className="text-base">Information</CardTitle>
                  <CardDescription className="mt-1">Senaste information från StoreFlow.</CardDescription>
                </div>
              </CardContent>
            </Card>
            <Card className="border-emerald-200 bg-emerald-50/70">
              <CardContent className="flex gap-4 p-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
                  <Link2 size={20} />
                </div>
                <div>
                  <CardTitle className="text-base">Ny uppdatering</CardTitle>
                  <CardDescription className="mt-1">Nya funktioner finns tillgängliga.</CardDescription>
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-3">
                <CardDescription>REKLAMATION</CardDescription>
                <CardTitle className="flex items-center gap-2 text-3xl text-red-600">
                  {flaggedProductCount} <TrendingDown size={20} />
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between text-sm text-muted-foreground">
                <span>{totalProductCount > 0 ? Math.round((flaggedProductCount / totalProductCount) * 100) : 0}% av totalt</span>
                <Button variant="link" className="h-auto p-0" onClick={() => setStep("reclamations")}>
                  Hantera <ChevronRight size={14} />
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardDescription>BRA VAROR</CardDescription>
                <CardTitle className="flex items-center gap-2 text-3xl text-emerald-600">
                  {goodProductCount} <TrendingUp size={20} />
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{productPercentage}% av totalt</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardDescription>TOTALT</CardDescription>
                <CardTitle className="flex items-center gap-2 text-3xl">
                  {totalProductCount} <Box size={20} />
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">Alla aktiva produkter</CardContent>
            </Card>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <Card className="min-h-64">
              <CardHeader>
                <CardTitle>Fördelning</CardTitle>
              </CardHeader>
              <CardContent className="flex min-h-40 flex-col items-center justify-center text-center text-muted-foreground">
                <Package size={34} className="mb-3 opacity-50" />
                <p>Ingen data ännu</p>
              </CardContent>
            </Card>
            <Card className="min-h-64">
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Senaste leveranserna</CardTitle>
                <Badge variant="outline">Senaste 5</Badge>
              </CardHeader>
              <CardContent className="flex min-h-40 flex-col items-center justify-center text-center text-muted-foreground">
                <Upload size={34} className="mb-3 opacity-50" />
                <p>Inga leveranser ännu.</p>
                <p className="text-sm">Ladda upp en följesedel för att komma igång.</p>
              </CardContent>
            </Card>
          </section>
        </div>
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
                  if (file) await handleFileUpload(file);
                }}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => document.getElementById("delivery-file")?.click()}
              >
                <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm font-medium">Dra och släpp Excel-filen här</p>
                <p className="text-xs text-muted-foreground mt-1">
                  eller klicka för att välja .xlsx
                </p>
              </div>
              <input
                id="delivery-file"
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={handleFileUpload}
                disabled={isLoading}
              />
            </div>

            {deliveryNotes.length > 0 && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-medium">Importerade {deliveryNotes.length} rader</h3>
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
                      <TableHead>Produkt</TableHead>
                      <TableHead>Varumärke</TableHead>
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
                      const hasValidDates =
                        Boolean(record.arrival_date) &&
                        Boolean(record.expiry_date) &&
                        !Number.isNaN(arrival.getTime()) &&
                        !Number.isNaN(expiry.getTime());
                      const daysRemaining = hasValidDates
                        ? Math.floor(
                            (expiry.getTime() - arrival.getTime()) / (1000 * 60 * 60 * 24),
                          )
                        : null;
                      const hasShelfLife =
                        Number.isFinite(record.shelf_lifetime_days) &&
                        record.shelf_lifetime_days > 0;

                      let minRequired: number;
                      if (record.shelf_lifetime_days <= 548) {
                        minRequired = Math.ceil(record.shelf_lifetime_days * 0.5);
                      } else {
                        minRequired = 274;
                      }

                      const isFlagged =
                        hasShelfLife && daysRemaining !== null && daysRemaining < minRequired;

                      return (
                        <TableRow key={record.id}>
                          <TableCell className="font-mono text-sm">
                            {record.product_url ? (
                              <a
                                href={record.product_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                              >
                                {record.sap_article_id}
                                <ExternalLink size={13} />
                              </a>
                            ) : (
                              record.sap_article_id
                            )}
                          </TableCell>
                          <TableCell>{record.product_name}</TableCell>
                          <TableCell>{record.brand || "-"}</TableCell>
                          <TableCell>{record.shelf_lifetime_days}</TableCell>
                          <TableCell>
                            {record.expiry_date
                              ? new Date(record.expiry_date).toLocaleDateString("sv-SE")
                              : "Ej registrerat"}
                          </TableCell>
                          <TableCell>
                            {record.arrival_date
                              ? new Date(record.arrival_date).toLocaleDateString("sv-SE")
                              : "Ej registrerat"}
                          </TableCell>
                          <TableCell>
                            {!hasValidDates ? (
                              <Badge variant="outline">Datum saknas</Badge>
                            ) : !hasShelfLife ? (
                              <Badge variant="outline">Hållbarhet saknas</Badge>
                            ) : isFlagged ? (
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
            <div className="mb-4 rounded-lg border p-4">
              <h3 className="mb-2 font-medium">Aktuella artiklar från senaste leveranser</h3>
              {shelfLifeRecords.filter((record) => record.arrival_date).length > 0 ? (
                <div className="max-h-64 overflow-y-auto text-sm">
                  {shelfLifeRecords
                    .filter(
                      (record) =>
                        record.arrival_date &&
                        record.expiry_date &&
                        new Date(record.expiry_date).getTime() < Date.now(),
                    )
                    .map((record) => (
                      <div
                        key={record.id}
                        className="flex items-center justify-between border-b py-2 last:border-0"
                      >
                        <div>
                          <div className="font-medium">
                            {record.product_name} {record.brand && `- ${record.brand}`}
                          </div>
                          <div className="font-mono text-xs">{record.sap_article_id}</div>
                        </div>
                        <div className="text-right text-muted-foreground">
                          <div>
                            Bäst före: {new Date(record.expiry_date).toLocaleDateString("sv-SE")}
                          </div>
                          <div className="text-xs">Anledning: Bäst-före-datum passerat</div>
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Ingen leverans är importerad ännu.
                </p>
              )}
            </div>
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
            <Button onClick={generateCompensationZip} disabled={isLoading}>
              {isLoading ? "Genererar fil..." : "Generera ersättningsfil"}
            </Button>
          </CardContent>
        </Card>
      )}

      {step === "statistics" && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight">Statistik</h2>
              <p className="text-muted-foreground">Din butiks reklamationer och återförda värden över tid.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline">Spotlight</Button>
              <Button variant="outline">Cockpit</Button>
              <Select defaultValue="ytd">
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="ytd">Hittills i år</SelectItem></SelectContent>
              </Select>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => exportTextAsCSV("statistik.csv", "period,aterfort_varde\nHittills i ar,0") }>
                <Download size={16} /> Exportera
              </Button>
            </div>
          </div>

          {replacementStatistics && (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Card className="border-emerald-200 bg-emerald-50/70"><CardHeader className="pb-2"><CardDescription>ÅTERFÖRT VÄRDE</CardDescription><CardTitle className="text-3xl text-emerald-700">0 kr</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">perioden pågår</CardContent></Card>
                <Card><CardHeader className="pb-2"><CardDescription>I VÄNTAN</CardDescription><CardTitle className="text-3xl">0 kr</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">{replacementStatistics.sentCount} skickade reklamationer</CardContent></Card>
                <Card><CardHeader className="pb-2"><CardDescription>GODKÄNNANDEGRAD</CardDescription><CardTitle className="text-3xl">{replacementStatistics.approvalRate}%</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">{replacementStatistics.approvedCount} av {replacementStatistics.decidedCount} avgjorda</CardContent></Card>
                <Card><CardHeader className="pb-2"><CardDescription>SNITT PER GODKÄND</CardDescription><CardTitle className="text-3xl">—</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">{replacementStatistics.totalCount} reklamationer totalt</CardContent></Card>
              </div>

              <Card>
                <CardHeader className="flex-row items-center justify-between"><div><CardTitle>Återfört över tid</CardTitle><CardDescription>Godkänt värde per månad</CardDescription></div><div className="flex gap-2"><Button size="sm" variant={statisticsView === "value" ? "default" : "outline"} onClick={() => setStatisticsView("value")}>Värde</Button><Button size="sm" variant={statisticsView === "count" ? "default" : "outline"} onClick={() => setStatisticsView("count")}>Antal</Button></div></CardHeader>
                <CardContent>
                  <div className="h-72 w-full"><ResponsiveContainer width="100%" height="100%"><LineChart data={replacementStatistics.monthly} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis allowDecimals={false} /><Tooltip /><Line type="monotone" dataKey={statisticsView} stroke="#059669" strokeWidth={3} dot={{ r: 3 }} /></LineChart></ResponsiveContainer></div>
                  <p className="text-sm text-muted-foreground">Vald period: Hittills i år - pågående månad (ej hel)</p>
                </CardContent>
              </Card>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card><CardHeader><CardTitle>Fördelning per flöde</CardTitle><CardDescription>Färskvaru • Fryst • Torrt • Hittills i år</CardDescription></CardHeader><CardContent className="text-sm text-muted-foreground">Inga reklamationer i perioden.</CardContent></Card>
                <Card><CardHeader><CardTitle>Återfört per kategori</CardTitle><CardDescription>Fördelat på 0 varugrupper • Hittills i år</CardDescription></CardHeader><CardContent className="text-sm text-muted-foreground">Inga godkända reklamationer i perioden.</CardContent></Card>
                <Card><CardHeader><CardTitle>Återkommande varor</CardTitle><CardDescription>Produkter du reklamerar oftast - kandidater att se över med leverantören</CardDescription></CardHeader><CardContent className="text-sm text-muted-foreground">Inga återkommande varor ännu.</CardContent></Card>
                <Card><CardHeader><CardTitle>Väntar på svar</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">Inga öppna reklamationer.</CardContent></Card>
              </div>
            </>
          )}
        </div>
      )}

      {/* Step 4: Weekly task */}
      {false && step === "weekly" && (
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
              Uppdatera status per reklamation.
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
        open={false}
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
                });
                setSelectedWeeklyProduct(null);
              }}
              className="space-y-4"
            >
              <div>
                <Label>Hållbarhet (dagar)</Label>
                <Input name="shelf_lifetime_days" type="number" placeholder="T.ex. 365" required />
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
