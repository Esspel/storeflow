/**
 * Ersättningscheck Route
 * Hanterar följesedelimport, hållbarhetsdatum och ersättningskrav
 * Enligt Coops datumregelverk för produktförfall
 */

import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { useState, useEffect, useMemo, useCallback } from "react";
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
  X,
  ArrowUpDown,
  Eye,
  EyeOff,
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
import { checkExtensionInstalled, fetchViaProxy } from "@/lib/sap-proxy";
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
  category: string;
};

type DeliveryStatistic = {
  sap_article_id: string;
  product_name: string;
  brand: string;
  arrival_date: string | null;
  expiry_date: string | null;
  delivery_status: string;
  category?: string;
};

type DeliveryFlow = "Färsk" | "Torrt" | "Fryst";

type DeliveryCategoryMapping = {
  id: string;
  category: string;
  flow: DeliveryFlow;
};

type ShelfLifeSortKey =
  "product_name" | "brand" | "shelf_lifetime_days" | "expiry_date" | "arrival_date" | "status";

type ReplacementStatistics = {
  returnedValue: number;
  pendingValue: number;
  sentCount: number;
  approvalRate: number;
  decidedCount: number;
  approvedCount: number;
  totalCount: number;
  monthly: Array<{ month: string; value: number; count: number }>;
  recurring: Array<{ sap_article_id: string; name: string; count: number }>;
  recurringBadDates: Array<{
    sap_article_id: string;
    name: string;
    badDeliveryCount: number;
    totalDeliveryCount: number;
  }>;
  flowCounts: Record<string, number>;
  categoryCounts: Record<string, number>;
  openCount: number;
  averageApprovedValue: number | null;
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
  const normalized = String(status ?? "")
    .trim()
    .toLowerCase();
  return normalized === "levererad" || normalized === "delivered";
}

function getSapProductUrl(storeNumber: string | null | undefined, sapArticleId: string) {
  if (!storeNumber || !sapArticleId) return null;
  return `https://s4r.sap.coop.se/sap/bc/ui2/flp?sap-client=100&sap-language=SV#Article-manage&/Store/${encodeURIComponent(storeNumber)}/Product/${encodeURIComponent(sapArticleId)}`;
}

function parseSek(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = String(value).replace(/\s/g, "").replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function calculateReimbursement(totalPrice: string | number | null | undefined) {
  const price = parseSek(totalPrice);
  return price === null ? null : Math.max(price - 0.02, 0);
}

function formatSek(value: number | null) {
  return value === null
    ? "—"
    : new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK" }).format(value);
}

function getMinimumShelfLifeDays(shelfLifetimeDays: number) {
  if (!Number.isFinite(shelfLifetimeDays) || shelfLifetimeDays <= 0) return null;
  return shelfLifetimeDays <= 548 ? Math.ceil(shelfLifetimeDays * 0.5) : 274;
}

function assessDelivery(
  arrivalDate: string | null | undefined,
  expiryDate: string | null | undefined,
  shelfLifetimeDays: number,
) {
  const arrival = arrivalDate ? new Date(arrivalDate).getTime() : Number.NaN;
  const expiry = expiryDate ? new Date(expiryDate).getTime() : Number.NaN;
  const minimumDays = getMinimumShelfLifeDays(shelfLifetimeDays);
  if (Number.isNaN(arrival) || Number.isNaN(expiry) || minimumDays === null) return null;
  const daysRemaining = Math.floor((expiry - arrival) / (1000 * 60 * 60 * 24));
  return {
    daysRemaining,
    minimumDays,
    isEligible: daysRemaining < minimumDays,
  };
}

const SAP_BASE_URL = "https://s4r.sap.coop.se";

function parseSapDate(dateValue: string | null | undefined): string | null {
  if (!dateValue) return null;
  const match = dateValue.match(/Date\((\d+)\)/);
  if (match) {
    return new Date(parseInt(match[1], 10)).toISOString();
  }
  const parsed = new Date(dateValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

interface SapProductData {
  ProductID: string;
  ProductName: string;
  MerchandiseCategory: string;
  MerchandiseCategoryName: string;
  RemainingShelfLifeInDays: string;
  Bnr: string;
  DeliveryDate: string | null;
  SalesPrice: string;
  GlobalTradeItemNumber: string;
}

async function fetchSapProductData(
  storeId: string,
  sapArticleId: string,
): Promise<SapProductData | null> {
  const url = `${SAP_BASE_URL}/sap/opu/odata/sap/RETAILSTORE_ORDER_PRODUCT_SRV/StoreProducts(StoreID='${encodeURIComponent(storeId)}',ProductID='${encodeURIComponent(sapArticleId)}')?$format=json`;

  try {
    const resp = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "x-csrf-token": "fetch",
      },
    });

    if (!resp.ok) {
      console.warn(`SAP request failed for ${sapArticleId}: ${resp.status} ${resp.statusText}`);
      return null;
    }

    const json = await resp.json();
    return (json.d ?? null) as SapProductData | null;
  } catch (err) {
    console.warn(`Network error fetching SAP data for ${sapArticleId}:`, err);
    return null;
  }
}

async function fetchAllRows(
  supabaseClient: typeof supabase,
  table: string,
  select: string,
  eq?: { column: string; value: unknown },
  order?: { column: string; ascending?: boolean },
  idColumn = "id",
): Promise<any[]> {
  const batchSize = 1000;
  const all: any[] = [];
  let from = 0;
  while (true) {
    let query = supabaseClient
      .from(table)
      .select(select)
      .range(from, from + batchSize - 1);
    if (eq) query = query.eq(eq.column, eq.value);
    if (order) query = query.order(order.column, { ascending: order.ascending ?? false });
    query = query.order(idColumn, { ascending: true });
    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < batchSize) break;
    from += batchSize;
  }
  return all;
}

export const Route = createFileRoute("/ersattningcheck")({
  component: ErstatningsCheckPage,
});

function ErstatningsCheckPage() {
  const { user, activeStore, loading: authLoading } = useAuth();
  const [step, setStep] = useState<
    | "dashboard"
    | "import"
    | "manage"
    | "generate"
    | "weekly"
    | "reclamations"
    | "statistics"
    | "category-mapping"
    | "admin-test"
  >("dashboard");
  const [reclamations, setReclamations] = useState<Reclamation[]>([]);
  const [statusFilter, setStatusFilter] = useState<ReclamationStatus>("Ej skickad");
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [deliveryNotes, setDeliveryNotes] = useState<DeliveryNoteRow[]>([]);
  const [matchResults, setMatchResults] = useState<ProductMatchResult[]>([]);
  const [shelfLifeRecords, setShelfLifeRecords] = useState<ShelfLifeRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [editingShelfLifeId, setEditingShelfLifeId] = useState<string | null>(null);
  const [editingShelfLifeValue, setEditingShelfLifeValue] = useState("");
  const [weeklyTask, setWeeklyTask] = useState<WeeklyTask[]>([]);
  const [selectedWeeklyProduct, setSelectedWeeklyProduct] = useState<WeeklyTask | null>(null);
  const [weeklyDays, setWeeklyDays] = useState("");
  const [deliveryStatistics, setDeliveryStatistics] = useState<DeliveryStatistic[]>([]);
  const [replacementStatistics, setReplacementStatistics] = useState<ReplacementStatistics | null>(
    null,
  );
  const [statisticsView, setStatisticsView] = useState<"value" | "count">("value");
  const [totalProductCount, setTotalProductCount] = useState(0);
  const [statisticsPeriod, setStatisticsPeriod] = useState<"ytd" | "last30" | "last12">("ytd");
  const [categoryMappings, setCategoryMappings] = useState<DeliveryCategoryMapping[]>([]);
  const [deliveryCategories, setDeliveryCategories] = useState<string[]>([]);
  const [mappingLoading, setMappingLoading] = useState(false);
  const [hiddenCategories, setHiddenCategories] = useState<string[]>([])
  const [testFixtureSapId, setTestFixtureSapId] = useState<string | null>(null);
  const [shelfLifeSearch, setShelfLifeSearch] = useState("");
  const [shelfLifeSort, setShelfLifeSort] = useState<
    Array<{
      key: ShelfLifeSortKey;
      direction: "asc" | "desc";
    }>
  >([]);
  const [hideOkRecords, setHideOkRecords] = useState(false);
    const [shelfLifeScrollTop, setShelfLifeScrollTop] = useState(0);
  const [importDates, setImportDates] = useState<string[]>([]);
  const [sapExtensionInstalled, setSapExtensionInstalled] = useState(false);
  const [sapExtensionChecked, setSapExtensionChecked] = useState(false);

  useEffect(() => {
    if (!importSuccess) return;
    const timeoutId = window.setTimeout(() => setImportSuccess(null), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [importSuccess]);

  // Check Chrome Extension status on mount and when needed
  useEffect(() => {
    let isMounted = true;

    const checkExtension = async () => {
      if (!isMounted) return;
      setSapExtensionChecked(false);
      const installed = await checkExtensionInstalled();
      if (isMounted) {
        setSapExtensionInstalled(installed);
        setSapExtensionChecked(true);
      }
    };

    void checkExtension();
    return () => {
      isMounted = false;
    };
  }, []);

  const supabaseClient = supabase;

  useEffect(() => {
    if (!activeStore?.id) return;
    void (async () => {
      const { data } = await supabaseClient
        .from("store_hidden_categories")
        .select("category")
        .eq("store_id", activeStore.id)
        .eq("is_hidden", true);
      if (data) setHiddenCategories(data.map((row: any) => String(row.category)));
    })();
  }, [activeStore?.id]);

  const refreshImportDates = async () => {
    if (!activeStore?.id) return;
    const allData = await fetchAllRows(
      supabaseClient,
      "store_product_deliveries",
      "arrival_date",
      { column: "store_id", value: activeStore.id },
      { column: "arrival_date", ascending: false },
    );
    const unique = Array.from(
      new Set(
        (allData ?? [])
          .filter((row: any) => row.arrival_date != null)
          .map((row: any) => String(row.arrival_date)),
      ),
    );
    setImportDates(unique);
  };

  useEffect(() => {
    if (!activeStore?.id) return;
    void (async () => {
      await refreshImportDates();
    })();
  }, [activeStore?.id]);

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

  const reclaimedProductCount = new Set(
    reclamations.map((reclamation) => reclamation.sap_article_id),
  ).size;
  const goodProductCount = Math.max(totalProductCount - reclaimedProductCount, 0);
  const productPercentage =
    totalProductCount > 0 ? Math.round((goodProductCount / totalProductCount) * 100) : 0;
  const eligibleShelfLifeRecords = shelfLifeRecords.filter(
    (record) =>
      assessDelivery(record.arrival_date, record.expiry_date, record.shelf_lifetime_days)
        ?.isEligible,
  );
  const hasImportedDeliveries = deliveryStatistics.length > 0;

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
        const deliveryNumbers = Array.from(
          new Set(
            deliveryRows.map((r) => r.delivery_number).filter((n): n is string => Boolean(n)),
          ),
        );
        if (deliveryNumbers.length > 0) {
          await supabase
            .from("store_product_deliveries")
            .delete()
            .eq("store_id", activeStore.id)
            .in("delivery_number", deliveryNumbers);
        }
        const { error: deliveryError } = await supabase
          .from("store_product_deliveries")
          .insert(deliveryRows);
        if (deliveryError) throw deliveryError;
      }

      await loadShelfLifeData();
      setStep("manage");
      void refreshImportDates();

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
      .then(({ data, error }) => {
        if (!error && data) setReclamations(data as Reclamation[]);
      });
  }, [activeStore?.id]);

  useEffect(() => {
    if (!activeStore?.id) return;
    void (async () => {
      await loadShelfLifeData();
      await loadCategoryMappings();
      const { count } = await supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("store_id", activeStore.id)
        .eq("is_active", true);
      setTotalProductCount(count ?? 0);
    })();
  }, [activeStore?.id]);

  // Load shelf life data
  const loadShelfLifeData = async () => {
    setIsLoading(true);
    try {
      const [productsData, masterResult, deliveriesData] = await Promise.all([
        fetchAllRows(supabaseClient, "products", "id, sap_article_id, name, brand, category", {
          column: "store_id",
          value: activeStore.id,
        }),
        supabase
          .from("product_shelf_life")
          .select("sap_article_id, shelf_lifetime_days, default_compensation_price_ore"),
        fetchAllRows(
          supabaseClient,
          "store_product_deliveries",
          "id, sap_article_id, best_before_date, arrival_date, status, delivery_number, product_name, brand, category",
          { column: "store_id", value: activeStore.id },
          { column: "arrival_date", ascending: false },
        ),
      ]);

      if (masterResult.error) throw masterResult.error;

      const masterMap = new Map(
        (masterResult.data ?? []).map((record: any) => [record.sap_article_id, record]),
      );
      const deliveriesByArticle = new Map<string, any[]>();
      for (const delivery of deliveriesData ?? []) {
        const list = deliveriesByArticle.get(delivery.sap_article_id) ?? [];
        list.push(delivery);
        deliveriesByArticle.set(delivery.sap_article_id, list);
      }

      const latestDelivery = new Map<string, any>();
      for (const [sapArticleId, deliveries] of deliveriesByArticle) {
        const delivered = deliveries.filter((d) => d.status === "Levererad" && d.arrival_date);
        if (delivered.length > 0) {
          latestDelivery.set(sapArticleId, delivered[0]);
          continue;
        }
        const withArrival = deliveries.filter((d) => d.arrival_date);
        if (withArrival.length > 0) {
          latestDelivery.set(sapArticleId, withArrival[0]);
        }
      }

      const productMap = new Map(
        (productsData ?? []).map((product: any) => [product.sap_article_id, product]),
      );
      const mergedArticleIds = new Set<string>([
        ...(productsData ?? []).map((p: any) => p.sap_article_id),
        ...latestDelivery.keys(),
      ]);
      setShelfLifeRecords(
        [...mergedArticleIds].map((sapArticleId) => {
          const product = productMap.get(sapArticleId) ?? {};
          const master = masterMap.get(sapArticleId) ?? {};
          const delivery = latestDelivery.get(sapArticleId) ?? {};
          return {
            id: delivery.id ?? product.id ?? sapArticleId,
            sap_article_id: sapArticleId,
            shelf_lifetime_days: master.shelf_lifetime_days ?? 0,
            expiry_date: delivery.best_before_date ?? "",
            arrival_date: delivery.arrival_date ?? "",
            compensation_price_ore: master.default_compensation_price_ore ?? 2,
            product_name: product.name ?? delivery.product_name ?? "Okänd produkt",
            brand: product.brand ?? delivery.brand ?? "",
            product_url: getSapProductUrl(activeStore.sap_site_id, sapArticleId),
            delivery_status: delivery.status ?? "",
            created_at: product.created_at ?? new Date().toISOString(),
            updated_at: product.updated_at ?? new Date().toISOString(),
            category: product.category ?? delivery.category ?? "",
          };
        }),
      );
      setDeliveryStatistics(
        (deliveriesData ?? []).map((delivery: any) => ({
          sap_article_id: delivery.sap_article_id,
          product_name: delivery.product_name || "Okänd produkt",
          brand: delivery.brand || "",
          arrival_date: delivery.arrival_date,
          expiry_date: delivery.best_before_date,
          delivery_status: delivery.status || "",
          category: delivery.category || "",
        })),
      );
    } catch (error) {
      console.error("Error loading shelf life:", error);
      setImportError("Kunde inte ladda hållbarhetsdata.");
    } finally {
      setIsLoading(false);
    }
  };

  const importShelfLifeFromSap = async () => {
    console.log("[importShelfLifeFromSap] Starting...");
    if (!activeStore) {
      console.log("[importShelfLifeFromSap] No active store, aborting");
      return;
    }

    // Use Chrome Extension proxy when available (bypasses CORS / PNA / SameSite)
    const useProxy = sapExtensionInstalled;
    console.log("[importShelfLifeFromSap] useProxy:", useProxy, "sapExtensionInstalled:", sapExtensionInstalled);

    // Get all articles from shelfLifeRecords that need to be fetched from SAP
    // Includes ALL records where shelf_lifetime_days is null/undefined/NaN/<=0
    // BUT excludes articles that are ALREADY in product_shelf_life table
    // (some records have shelf_lifetime_days=0 which means "data already fetched")

    // Step 1: Get all sap_article_ids that we want to skip (they already have data)
    let existingSapIds = new Set<string>();
    if (activeStore) {
      const { data: existingIds } = await supabase
        .from("product_shelf_life")
        .select("sap_article_id")
        .eq("store_id", activeStore.id); // Only for THIS store
      existingSapIds = new Set(existingIds?.map((r: any) => r.sap_article_id) ?? []);
      console.log("[importShelfLifeFromSap] Already have shelf_lifetime_days for:", existingSapIds.size, "articles");
    }

    // Step 2: Filter shelfLifeRecords for eligible articles
    const eligible = shelfLifeRecords.filter((record) => {
      // Skip if already have data in product_shelf_life
      if (existingSapIds.has(record.sap_article_id)) return false;

      const status = getShelfLifeStatus(record);
      return (status === "Hållbarhet saknas" || status === "Datum saknas") &&
             (record.shelf_lifetime_days == null ||
              Number.isNaN(record.shelf_lifetime_days) ||
              record.shelf_lifetime_days <= 0);
    });

    console.log("[importShelfLifeFromSap] eligible (not in product_shelf_life):", eligible.length, "articles");
    if (eligible.length > 0) {
      console.log("[importShelfLifeFromSap] First eligible:", eligible[0]);
    }

    if (eligible.length === 0) {
      toast.info("Inga artiklar med 'Ej angiven' hållbarhet att uppdatera.");
      return;
    }

    setIsLoading(true);
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < eligible.length; i++) {
      const record = eligible[i];
      try {
        // Fetch via proxy when extension is installed
        const sapData = useProxy
          ? await (async () => {
              console.log(`[SAP Proxy] Fetching for article ${record.sap_article_id}`);
              const proxyResponse = await fetchViaProxy(
                `https://s4r.sap.coop.se/sap/opu/odata/sap/RETAILSTORE_ORDER_PRODUCT_SRV/StoreProducts(StoreID='${encodeURIComponent(activeStore.sap_site_id ?? activeStore.id)}',ProductID='${encodeURIComponent(record.sap_article_id)}')?$format=json`,
                "GET",
                { Accept: "application/json" },
              );
              console.log(`[SAP Proxy] Response for ${record.sap_article_id}:`, proxyResponse);
              if (!proxyResponse.success) {
                console.error(`[SAP Proxy] Failed for ${record.sap_article_id}:`, proxyResponse.error);
                return null;
              }
              const json = proxyResponse.data ?? "";
              if (!json) {
                console.error(`[SAP Proxy] No JSON data for ${record.sap_article_id}`);
                return null;
              }
              console.log(`[SAP Proxy] Raw JSON for ${record.sap_article_id}:`, json.substring(0, 200));
              let parsed;
              try {
                parsed = JSON.parse(json);
              } catch (e) {
                console.error(`[SAP Proxy] JSON parse error for ${record.sap_article_id}:`, e, json.substring(0, 200));
                return null;
              }
              const result = parsed.d || null;
              console.log(`[SAP Proxy] Extracted data for ${record.sap_article_id}:`, result);
              return result;
            })()
          : await fetchSapProductData(
              activeStore.sap_site_id ?? activeStore.id,
              record.sap_article_id,
            );

        if (!sapData) {
          errorCount += 1;
          continue;
        }

        const shelfLifeDays = parseInt(sapData.RemainingShelfLifeInDays, 10);
        const now = new Date().toISOString();

        const { error } = await supabase.from("product_shelf_life").upsert(
          {
            sap_article_id: record.sap_article_id,
            shelf_lifetime_days: Number.isFinite(shelfLifeDays) ? shelfLifeDays : 0,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "sap_article_id" },
        );

        if (error) {
          console.error("Error upserting shelf life:", error);
          errorCount += 1;
          continue;
        }

        successCount += 1;
      } catch (err) {
        console.error("Error fetching from SAP:", err);
        errorCount += 1;
      }

      // Small interval to avoid rate limits (10ms)
      if (i < eligible.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      if (successCount + (errorCount % 10) === 0) {
        toast.info(`Hämtad ${successCount}/${eligible.length}...`);
      }
    }

    await loadShelfLifeData();
    if (successCount > 0) {
      toast.success(`Hämtade hållbarhetsdata för ${successCount} artiklar.`);
    }
    if (errorCount > 0) {
      toast.error(`Kunde inte hämta ${errorCount} artiklar (får fel från SAP).`);
    }
  };

  const loadCategoryMappings = async () => {
    let mappings: DeliveryCategoryMapping[] = [];
    let categoryRowsRaw: any[] = [];
    try {
      const [mappingsResult, categoryResult] = await Promise.all([
        supabase
          .from("delivery_category_flow_mappings")
          .select("id, category, flow")
          .order("category"),
        supabase.rpc("get_store_distinct_categories", {
          p_store_id: activeStore.id,
        }),
      ]);
      if (!mappingsResult.error) {
        mappings = mappingsResult.data ?? [];
      } else {
        console.error("Error loading mappings:", mappingsResult.error);
      }
      if (!categoryResult.error) {
        categoryRowsRaw = categoryResult.data ?? [];
      } else {
        console.error("Error loading distinct categories:", categoryResult.error);
      }
    } catch (error) {
      console.error("Error loading category mappings:", error);
      toast.error("Kunde inte ladda kategorier.");
    }
    setCategoryMappings(mappings);
    const seen = new Map<string, string>();
    const merged: string[] = [];
    for (const row of categoryRowsRaw) {
      const raw = String(row.category ?? "").trim();
      if (!raw) continue;
      const key = raw.toLowerCase();
      if (!seen.has(key)) {
        seen.set(key, raw);
        merged.push(raw);
      }
    }
    merged.sort((a, b) => a.localeCompare(b, "sv"));
    setDeliveryCategories(merged);
  };

  const saveCategoryMapping = async (category: string, flow: DeliveryFlow) => {
    setMappingLoading(true);
    try {
      const { data, error } = await supabase
        .from("delivery_category_flow_mappings")
        .upsert(
          { category, flow, updated_at: new Date().toISOString() },
          { onConflict: "category" },
        )
        .select("id, category, flow")
        .single();
      if (error) throw error;
      setCategoryMappings((current) =>
        [
          ...current.filter((mapping) => mapping.category !== category),
          data as DeliveryCategoryMapping,
        ].sort((a, b) => a.category.localeCompare(b.category, "sv")),
      );
      toast.success(`Kategorin ${category} kopplades till ${flow}.`);
    } catch (error) {
      console.error("Error saving category mapping:", error);
      toast.error("Kunde inte spara flödesmappningen.");
    } finally {
      setMappingLoading(false);
    }
  };

  const getMappedFlow = (category: string | null | undefined): DeliveryFlow => {
    const normalizedCategory = String(category ?? "").trim();
    const mapped = categoryMappings.find(
      (mapping) => mapping.category === normalizedCategory,
    )?.flow;
    if (mapped) return mapped;
    const lowerCategory = normalizedCategory.toLowerCase();
    if (lowerCategory.includes("frys")) return "Fryst";
    if (lowerCategory.includes("färsk") || lowerCategory.includes("farsk")) return "Färsk";
    return "Torrt";
  };

  const createAdminTestFixture = async (includeReclamation: boolean) => {
    if (user.role !== "admin") return null;
    setIsLoading(true);
    const sapArticleId = `TEST-${Date.now()}`;
    try {
      const { error: productError } = await supabase.from("products").insert({
        store_id: activeStore.id,
        sap_article_id: sapArticleId,
        bnr: `TEST-${Date.now()}`,
        name: "TEST - Ersättningsartikel",
        brand: "StoreFlow test",
        category: "TEST",
        is_active: true,
      });
      if (productError) throw productError;

      const arrivalDate = new Date();
      const expiryDate = new Date(arrivalDate);
      expiryDate.setDate(expiryDate.getDate() + 30);
      const { error: deliveryError } = await supabase.from("store_product_deliveries").insert({
        store_id: activeStore.id,
        sap_article_id: sapArticleId,
        arrival_date: arrivalDate.toISOString(),
        best_before_date: expiryDate.toISOString(),
        quantity: 1,
        status: "Levererad",
        delivery_number: `TEST-${Date.now()}`,
        product_name: "TEST - Ersättningsartikel",
        brand: "StoreFlow test",
        bnr: `TEST-${Date.now()}`,
        category: "TEST",
        total_price: "100.00",
      });
      if (deliveryError) throw deliveryError;

      const { error: shelfLifeError } = await supabase
        .from("product_shelf_life")
        .upsert(
          { sap_article_id: sapArticleId, shelf_lifetime_days: 365 },
          { onConflict: "sap_article_id" },
        );
      if (shelfLifeError) throw shelfLifeError;

      if (includeReclamation) {
        const { error: reclamationError } = await supabase.from("reclamations").insert({
          store_id: activeStore.id,
          sap_article_id: sapArticleId,
          status: "Ej skickad",
          notes: "TESTDATA - kan tas bort från testsidan",
        });
        if (reclamationError) throw reclamationError;
      }

      setTestFixtureSapId(sapArticleId);
      await loadShelfLifeData();
      if (includeReclamation) {
        const { data } = await supabase
          .from("reclamations")
          .select("*")
          .eq("store_id", activeStore.id);
        if (data) setReclamations(data as Reclamation[]);
      }
      toast.success("Testdata skapad. Den är märkt TESTDATA och kan rensas från testsidan.");
      return sapArticleId;
    } catch (error) {
      console.error("Error creating admin test fixture:", error);
      toast.error("Kunde inte skapa testdata.");
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const removeAdminTestFixture = async () => {
    if (user.role !== "admin") return;
    setIsLoading(true);
    try {
      const { data: testProducts } = await supabase
        .from("products")
        .select("sap_article_id")
        .eq("store_id", activeStore.id)
        .like("sap_article_id", "TEST-%");
      const testSapIds = (testProducts ?? []).map((p: any) => p.sap_article_id);
      if (testSapIds.length === 0) {
        toast.info("Ingen testdata hittades.");
        return;
      }
      await supabase
        .from("reclamations")
        .delete()
        .eq("store_id", activeStore.id)
        .in("sap_article_id", testSapIds);
      await supabase
        .from("store_product_deliveries")
        .delete()
        .eq("store_id", activeStore.id)
        .in("sap_article_id", testSapIds);
      await supabase.from("product_shelf_life").delete().in("sap_article_id", testSapIds);
      await supabase
        .from("products")
        .delete()
        .eq("store_id", activeStore.id)
        .in("sap_article_id", testSapIds);
      setTestFixtureSapId(null);
      await loadShelfLifeData();
      setReclamations((current) =>
        current.filter((item) => !testSapIds.includes(item.sap_article_id)),
      );
      toast.success(`Rensade ${testSapIds.length} testartiklar.`);
    } catch (error) {
      console.error("Error removing admin test fixtures:", error);
      toast.error("Kunde inte rensa testdata.");
    } finally {
      setIsLoading(false);
    }
  };

  const testCompensationGeneration = async () => {
    const sapArticleId = await createAdminTestFixture(false);
    if (!sapArticleId) return;
    await generateCompensationZip();
    await removeAdminTestFixture();
  };

  const loadDeliveryStatistics = async (period = statisticsPeriod) => {
    setIsLoading(true);
    try {
      const [
        deliveriesData,
        { data: reclamationData, error: reclamationError },
        { data: masterData, error: masterError },
      ] = await Promise.all([
        fetchAllRows(
          supabaseClient,
          "store_product_deliveries",
          "sap_article_id, product_name, brand, category, total_price, arrival_date, best_before_date, status",
          { column: "store_id", value: activeStore.id },
          { column: "arrival_date", ascending: false },
        ),
        supabase
          .from("reclamations")
          .select("sap_article_id, status, created_at")
          .eq("store_id", activeStore.id),
        supabase
          .from("product_shelf_life")
          .select("sap_article_id, shelf_lifetime_days, default_compensation_price_ore"),
      ]);
      if (!deliveriesData) throw new Error("No delivery data returned");
      if (reclamationError) throw reclamationError;
      if (masterError) throw masterError;
      setDeliveryStatistics(
        (deliveriesData ?? []).map((row: any) => ({
          sap_article_id: row.sap_article_id,
          product_name: row.product_name || "Okänd produkt",
          brand: row.brand || "",
          arrival_date: row.arrival_date,
          expiry_date: row.best_before_date,
          delivery_status: row.status || "",
          category: row.category || "Okänd",
        })),
      );
      const now = new Date();
      const periodStart = new Date(now.getFullYear(), 0, 1);
      if (period === "last30") periodStart.setDate(now.getDate() - 30);
      if (period === "last12") periodStart.setMonth(now.getMonth() - 11, 1);
      const reclamationsForPeriod = (reclamationData ?? []).filter(
        (row: any) => new Date(row.created_at) >= periodStart,
      );
      const deliveriesByArticle = new Map<string, any[]>();
      for (const delivery of deliveriesData ?? []) {
        const deliveries = deliveriesByArticle.get(delivery.sap_article_id) ?? [];
        deliveries.push(delivery);
        deliveriesByArticle.set(delivery.sap_article_id, deliveries);
      }
      const getReclamationAmount = (reclamation: any) => {
        const deliveries = deliveriesByArticle.get(reclamation.sap_article_id) ?? [];
        const createdAt = new Date(reclamation.created_at).getTime();
        const matchingDelivery =
          deliveries.find((delivery) => new Date(delivery.arrival_date).getTime() <= createdAt) ??
          deliveries[0];
        return calculateReimbursement(matchingDelivery?.total_price) ?? 0;
      };
      const totalCount = reclamationsForPeriod.length;
      const sentCount = reclamationsForPeriod.filter(
        (row: any) => row.status === "Granskas av butikssupporten",
      ).length;
      const decidedCount = reclamationsForPeriod.filter((row: any) =>
        ["Löst", "Nekad"].includes(row.status),
      ).length;
      const approvedCount = reclamationsForPeriod.filter(
        (row: any) => row.status === "Löst",
      ).length;
      const returnedValue = reclamationsForPeriod
        .filter((row: any) => row.status === "Löst")
        .reduce((sum: number, row: any) => sum + getReclamationAmount(row), 0);
      const pendingValue = reclamationsForPeriod
        .filter((row: any) => !["Löst", "Nekad"].includes(row.status))
        .reduce((sum: number, row: any) => sum + getReclamationAmount(row), 0);
      const monthly = (() => {
        if (period === "last30") {
          const now = new Date();
          return Array.from({ length: 30 }, (_, i) => {
            const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (29 - i));
            const key = d.toISOString().split("T")[0];
            const dayReclamations = reclamationsForPeriod.filter(
              (row: any) => row.status === "Löst" && row.created_at?.startsWith(key),
            );
            const dayCount = reclamationsForPeriod.filter((row: any) =>
              row.created_at?.startsWith(key),
            ).length;
            return {
              month: d.toLocaleDateString("sv-SE", { day: "numeric", month: "short" }),
              value: dayReclamations.reduce(
                (sum: number, row: any) => sum + getReclamationAmount(row),
                0,
              ),
              count: dayCount,
            };
          });
        }
        return Array.from({ length: 12 }, (_, month) => ({
          month: new Date(2000, month, 1).toLocaleDateString("sv-SE", { month: "short" }),
          value: reclamationsForPeriod
            .filter((row: any) => row.status === "Löst")
            .filter((row: any) => new Date(row.created_at).getMonth() === month)
            .reduce((sum: number, row: any) => sum + getReclamationAmount(row), 0),
          count: reclamationsForPeriod.filter(
            (row: any) => new Date(row.created_at).getMonth() === month,
          ).length,
        }));
      })();
      const recurringMap = new Map<
        string,
        { sap_article_id: string; name: string; count: number }
      >();
      for (const row of reclamationsForPeriod) {
        const current = recurringMap.get(row.sap_article_id) ?? {
          sap_article_id: row.sap_article_id,
          name: row.sap_article_id,
          count: 0,
        };
        current.count += 1;
        recurringMap.set(row.sap_article_id, current);
      }
      const deliveryMap = new Map(
        (deliveriesData ?? []).map((row: any) => [row.sap_article_id, row]),
      );
      const recurring = [...recurringMap.values()]
        .map((item) => ({
          ...item,
          name: deliveryMap.get(item.sap_article_id)?.product_name || item.name,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
      const flowCounts: Record<string, number> = { Färsk: 0, Fryst: 0, Torrt: 0 };
      for (const reclamation of reclamationsForPeriod) {
        const flow = getMappedFlow(deliveryMap.get(reclamation.sap_article_id)?.category);
        flowCounts[flow] += 1;
      }
      const categoryCounts: Record<string, number> = {};
      for (const reclamation of reclamationData ?? []) {
        if (reclamation.status === "Löst") {
          const category = deliveryMap.get(reclamation.sap_article_id)?.category || "Okänd";
          categoryCounts[category] = (categoryCounts[category] || 0) + 1;
        }
      }
      const masterMap = new Map((masterData ?? []).map((row: any) => [row.sap_article_id, row]));
      const recurringBadDatesMap = new Map<
        string,
        {
          sap_article_id: string;
          name: string;
          badDeliveryCount: number;
          totalDeliveryCount: number;
        }
      >();
      for (const delivery of deliveriesData ?? []) {
        const master = masterMap.get(delivery.sap_article_id);
        const assessment = assessDelivery(
          delivery.arrival_date,
          delivery.best_before_date,
          master?.shelf_lifetime_days ?? 0,
        );
        if (!assessment?.isEligible) continue;
        const current = recurringBadDatesMap.get(delivery.sap_article_id) ?? {
          sap_article_id: delivery.sap_article_id,
          name: delivery.product_name || "Okänd produkt",
          badDeliveryCount: 0,
          totalDeliveryCount: 0,
        };
        current.totalDeliveryCount += 1;
        current.badDeliveryCount += 1;
        recurringBadDatesMap.set(delivery.sap_article_id, current);
      }
      for (const [sapArticleId, deliveries] of deliveriesByArticle) {
        if (recurringBadDatesMap.has(sapArticleId)) continue;
        let badCount = 0;
        for (const delivery of deliveries) {
          const master = masterMap.get(delivery.sap_article_id);
          const assessment = assessDelivery(
            delivery.arrival_date,
            delivery.best_before_date,
            master?.shelf_lifetime_days ?? 0,
          );
          if (assessment?.isEligible) badCount += 1;
        }
        if (badCount > 0) {
          const current = recurringBadDatesMap.get(sapArticleId) ?? {
            sap_article_id: sapArticleId,
            name: deliveries[0]?.product_name || "Okänd produkt",
            badDeliveryCount: 0,
            totalDeliveryCount: 0,
          };
          current.totalDeliveryCount = deliveries.length;
          current.badDeliveryCount = badCount;
          recurringBadDatesMap.set(sapArticleId, current);
        }
      }
      const recurringBadDates = [...recurringBadDatesMap.values()]
        .filter((item) => item.badDeliveryCount >= 2)
        .sort((a, b) => b.badDeliveryCount - a.badDeliveryCount)
        .slice(0, 5);
      setReplacementStatistics({
        returnedValue,
        pendingValue,
        sentCount,
        approvalRate: decidedCount === 0 ? 0 : Math.round((approvedCount / decidedCount) * 100),
        decidedCount,
        approvedCount,
        totalCount,
        monthly,
        recurring,
        recurringBadDates,
        flowCounts,
        categoryCounts,
        openCount: reclamationsForPeriod.filter(
          (row: any) => !["Löst", "Nekad"].includes(row.status),
        ).length,
        averageApprovedValue: approvedCount > 0 ? returnedValue / approvedCount : null,
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
    } catch (e) {
      toast.error("Kunde inte spara hållbarhetsdata.");
    } finally {
      setIsLoading(false);
    }
  };

  // Save shelf life data
  const saveShelfLife = async (record: { sap_article_id: string; shelf_lifetime_days: number }) => {
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

      await loadShelfLifeData();
    } catch (error) {
      console.error("Error saving shelf life:", error);
      setImportError("Kunde inte spara hållbarhetsdata.");
    } finally {
      setIsLoading(false);
    }
  };

  const saveInlineShelfLife = async (record: ShelfLifeRecord, value: string) => {
    const days = Number.parseInt(value, 10);
    if (!Number.isInteger(days) || days <= 0) {
      toast.error("Ange ett heltal större än 0.");
      return;
    }
    await saveShelfLife({
      sap_article_id: record.sap_article_id,
      shelf_lifetime_days: days,
    });
    setEditingShelfLifeId((currentId) => (currentId === record.id ? null : currentId));
  };

  // Generate compensation zip (.txt per leverans + temperaturzon)
  const generateCompensationZip = async () => {
    setIsLoading(true);
    try {
      // Läs leveranshistorik från store_product_deliveries (inte masterdata-tabellen)
      const shelfData = await fetchAllRows(
        supabaseClient,
        "store_product_deliveries",
        "sap_article_id, bnr, best_before_date, arrival_date, quantity, status, delivery_number, product_name, brand, category",
        { column: "store_id", value: activeStore.id },
        { column: "arrival_date", ascending: false },
      );

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
      // Hämta masterdata för shelf_lifetime_days och temperature_zone
      const { data: masterData, error: masterErr } = await supabase
        .from("product_shelf_life")
        .select("sap_article_id, shelf_lifetime_days, temperature_zone");
      if (masterErr) throw masterErr;
      const masterMap = new Map((masterData ?? []).map((m: any) => [m.sap_article_id, m]));
      const products = await fetchAllRows(
        supabaseClient,
        "products",
        "sap_article_id, name, brand, bnr",
        { column: "store_id", value: activeStore.id },
      );
      const productMap = new Map(products.map((p: any) => [p.sap_article_id, p]));
      const flagged = Array.from(latestByArticle.values())
        .map((delivery) => ({
          delivery,
          assessment: assessDelivery(
            delivery.arrival_date,
            delivery.best_before_date,
            masterMap.get(delivery.sap_article_id)?.shelf_lifetime_days ?? 0,
          ),
        }))
        .filter((item) => item.assessment?.isEligible)
        .map((item) => item.delivery);
      if (flagged.length === 0) {
        setImportSuccess("Inga leveranser understiger Coop:s hållbarhetskrav.");
        return;
      }

      // Gruppera per leveransnummer + temperaturzon
      const groups: Record<string, Array<any>> = {};
      for (const r of flagged) {
        const master = masterMap.get(r.sap_article_id) || {};
        const leverans = r.delivery_number ? String(r.delivery_number) : "okand";
        const zon = (master as any)?.temperature_zone || getMappedFlow(r.category).toLowerCase();
        const shelfDays = (master as any)?.shelf_lifetime_days || 0;
        const assessment = assessDelivery(r.arrival_date, r.best_before_date, shelfDays);
        const product = productMap.get(r.sap_article_id) || {};
        const key = `${leverans}__${zon}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push({
          ...r,
          shelf_lifetime_days: shelfDays,
          temperature_zone: zon,
          product_name: product.name || r.product_name || "Okänd produkt",
          brand: product.brand || r.brand || "",
          bnr: r.bnr || product.bnr || "",
          reason: `Kvarvarande ${assessment?.daysRemaining ?? 0} dagar < minsta ${assessment?.minimumDays ?? 0} dagar enligt Coop:s regelverk`,
        });
      }

      const files = Object.entries(groups).map(([key, rows]) => {
        const [leverans, zon] = key.split("__");
        const content = [
          `LEVERANS: ${leverans}`,
          `TEMPERATURZON: ${zon}`,
          `SAP_ARTIKEL_ID|BNR|PRODUKT|VARUMARKE|HALLBARHET_DAGAR|UTGANGSDATUM|ANKOMST|ANLEDNING`,
          ...rows.map((row: any) =>
            [
              row.sap_article_id,
              row.bnr,
              row.product_name,
              row.brand,
              row.shelf_lifetime_days,
              row.best_before_date?.split("T")[0] || row.best_before_date,
              row.arrival_date?.split("T")[0] || row.arrival_date,
              row.reason,
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

  const getShelfLifeStatus = (record: ShelfLifeRecord) => {
    if (!record.arrival_date || !record.expiry_date) return "Datum saknas";
    if (
      record.shelf_lifetime_days == null ||
      Number.isNaN(record.shelf_lifetime_days) ||
      record.shelf_lifetime_days <= 0
    ) {
      return "Hållbarhet saknas";
    }
    return assessDelivery(record.arrival_date, record.expiry_date, record.shelf_lifetime_days)
      ?.isEligible
      ? "Kräver ersättning"
      : "OK";
  };

  const filteredShelfLifeRecords = useMemo(() => {
    const search = shelfLifeSearch.trim().toLocaleLowerCase("sv");

    const autoHiddenCategories = new Set(
      hiddenCategories.map((c) => c.toLowerCase()),
    );

    const withStatus = shelfLifeRecords.map((record) => ({
      record,
      status: getShelfLifeStatus(record),
    }));

    const filtered = withStatus
      .filter(({ record, status }) => {
        if (!search) return true;
        return [
          record.sap_article_id,
          record.product_name,
          record.brand,
          String(record.shelf_lifetime_days ?? ""),
          record.expiry_date,
          record.arrival_date,
          status,
        ].some((value) => String(value ?? "").toLocaleLowerCase("sv").includes(search));
      })
      .filter(({ record }) => {
        const recordCategory = String(record.category ?? "").trim();
        const lowerCategory = recordCategory.toLowerCase();
        if (hiddenCategories.some((c) => c.toLowerCase() === lowerCategory)) return false;
        if (autoHiddenCategories.has(lowerCategory)) {
          return Boolean(record.shelf_lifetime_days && record.shelf_lifetime_days > 0);
        }
        return true;
      })
      .filter(({ status }) => {
        if (!hideOkRecords) return true;
        return status !== "OK";
      });

    filtered.sort((a, b) => {
      const leftMissing = (a.record.shelf_lifetime_days == null || Number.isNaN(a.record.shelf_lifetime_days) || a.record.shelf_lifetime_days <= 0) ? 0 : 1;
      const rightMissing = (b.record.shelf_lifetime_days == null || Number.isNaN(b.record.shelf_lifetime_days) || b.record.shelf_lifetime_days <= 0) ? 0 : 1;
      if (leftMissing !== rightMissing) return leftMissing - rightMissing;
      for (const sort of shelfLifeSort) {
        const leftRaw = sort.key === "status" ? a.status : (a.record[sort.key] ?? "");
        const rightRaw = sort.key === "status" ? b.status : (b.record[sort.key] ?? "");
        let comparison: number;
        if (sort.key === "shelf_lifetime_days") {
          // Numeric sort: treat "Ej angiven" (null/0/NaN) as lowest so numbers come first
          const aNum = a.record.shelf_lifetime_days ?? 0;
          const bNum = b.record.shelf_lifetime_days ?? 0;
          const aIsEmpty = !aNum || Number.isNaN(Number(aNum));
          const bIsEmpty = !bNum || Number.isNaN(Number(bNum));

          if (aIsEmpty && !bIsEmpty) comparison = -1;
          else if (!aIsEmpty && bIsEmpty) comparison = 1;
          else comparison = Number(aNum) - Number(bNum);
        } else {
          comparison = String(leftRaw).localeCompare(String(rightRaw), "sv", {
            numeric: true,
            sensitivity: "base",
          });
        }
        if (comparison !== 0) {
          return sort.direction === "asc" ? comparison : -comparison;
        }
      }
      return 0;
    });

    return filtered.map((item) => item.record);
  }, [shelfLifeRecords, shelfLifeSearch, hiddenCategories, hideOkRecords, shelfLifeSort]);

  const toggleShelfLifeSort = (key: ShelfLifeSortKey, shiftKey = false) => {
    setShelfLifeSort((current) => {
      const existingIndex = current.findIndex((s) => s.key === key);

      if (existingIndex >= 0) {
        // Column exists - toggle direction
        const newDirection = current[existingIndex].direction === "asc" ? "desc" : "asc";
        const updated = [...current];
        updated[existingIndex] = { ...updated[existingIndex], direction: newDirection };
        return updated;
      }

      // Column doesn't exist - add with asc direction
      if (!shiftKey) {
        // No shift key: only this column should be sorted
        return [{ key, direction: "asc" }];
      }
      // Shift key: add to existing sort array
      return [...current, { key, direction: "asc" }];
    });
  };

  const moveSortToFront = (key: ShelfLifeSortKey) => {
    setShelfLifeSort((current) => {
      const entry = current.find((s) => s.key === key);
      if (!entry) return current;
      const others = current.filter((s) => s.key !== key);
      return [{ ...entry }, ...others];
    });
  };

  const removeShelfLifeSort = (key: ShelfLifeSortKey) => {
    setShelfLifeSort((current) => current.filter((s) => s.key !== key));
  };

  const toggleHiddenCategory = async (category: string) => {
    setMappingLoading(true);
    try {
      const current = hiddenCategories.find((c) => c.toLowerCase() === category.toLowerCase());
      const nextHidden = !current;
      const { error } = await supabase.from("store_hidden_categories").upsert(
        {
          store_id: activeStore.id,
          category,
          is_hidden: nextHidden,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "store_id,category" },
      );
      if (error) throw error;
      setHiddenCategories((current) => {
        if (nextHidden) {
          const exists = current.some((c) => c.toLowerCase() === category.toLowerCase());
          return exists ? current : [...current, category];
        }
        return current.filter((c) => c.toLowerCase() !== category.toLowerCase());
      });
    } catch (error) {
      console.error("Error toggling hidden category:", error);
      toast.error("Kunde inte uppdatera dold kategorival.");
    } finally {
      setMappingLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <PageHeader
        title="Ersättningskontroll"
        description="Hantera följesedel, hållbarhetsdata och leveranser"
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
          onClick={() => void loadDeliveryStatistics()}
          className="flex items-center gap-2"
        >
          <BarChart3 size={16} />
          5. Statistik
        </Button>
        {user.role === "admin" && (
          <>
            <Button
              variant={step === "category-mapping" ? "default" : "outline"}
              onClick={() => {
                void loadCategoryMappings();
                setStep("category-mapping");
              }}
              className="flex items-center gap-2"
            >
              <Settings size={16} />
              6. Koppla flöden
            </Button>
            <Button
              variant={step === "admin-test" ? "default" : "outline"}
              onClick={() => setStep("admin-test")}
              className="flex items-center gap-2"
            >
              <CheckCircle2 size={16} />
              Testa flöden
            </Button>
          </>
        )}
      </div>

      {/* Alerts */}
      {importError && (
        <Alert variant="destructive" className="mb-4 flex items-start justify-between gap-3">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{importError}</AlertDescription>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="-mr-2 -mt-2 shrink-0"
            onClick={() => setImportError(null)}
            aria-label="Stäng meddelande"
            title="Stäng meddelande"
          >
            <X size={16} />
          </Button>
        </Alert>
      )}
      {importSuccess && (
        <Alert className="mb-4 flex items-start justify-between gap-3">
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>{importSuccess}</AlertDescription>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="-mr-2 -mt-2 shrink-0"
            onClick={() => setImportSuccess(null)}
            aria-label="Stäng meddelande"
            title="Stäng meddelande"
          >
            <X size={16} />
          </Button>
        </Alert>
      )}

      {step === "admin-test" && user.role === "admin" && (
        <Card>
          <CardHeader>
            <CardTitle>Testa ersättningsflödet</CardTitle>
            <CardDescription>
              Skapar verklig, tydligt märkt testdata i den aktiva butiken så att admin kan prova
              hantering och generering. Testdata kan rensas efteråt.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={async () => {
                  const sapArticleId = await createAdminTestFixture(true);
                  if (sapArticleId) setStep("reclamations");
                }}
                disabled={isLoading}
              >
                Testa Hantera varor
              </Button>
              <Button onClick={testCompensationGeneration} disabled={isLoading} variant="secondary">
                Testa generera ersättning
              </Button>
              {testFixtureSapId && (
                <Button onClick={removeAdminTestFixture} disabled={isLoading} variant="destructive">
                  Rensa testdata
                </Button>
              )}
            </div>
            {testFixtureSapId && (
              <p className="text-sm text-muted-foreground">
                Aktiv testartikel: <span className="font-mono">{testFixtureSapId}</span>
              </p>
            )}
          </CardContent>
            <div className="pt-2 border-t mt-2">
              <p className="text-xs font-medium text-muted-foreground mb-2">Testa SAP-flöde för enskild artikel (materialnummer):</p>
              <div className="flex items-end gap-2">
                <input id="test-sap-id" type="text" placeholder="SAP materialnummer / artikel-ID"
                  className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring w-64"
                  defaultValue={testFixtureSapId || ""} />
                <Button size="sm" variant="outline"
                  onClick={async () => {
                    const input = document.getElementById("test-sap-id") as HTMLInputElement | null;
                    const sapArticleId = input?.value.trim();
                    if (!sapArticleId) { toast.error("Ange ett SAP-product-ID / materialnummer."); return; }
                    console.log("[Test SAP] Testing single article:", sapArticleId);
                    try {
                      const sapData = sapExtensionInstalled
                        ? await (async () => {
                            const proxyResponse = await fetchViaProxy(
                              `https://s4r.sap.coop.se/sap/opu/odata/sap/RETAILSTORE_ORDER_PRODUCT_SRV/StoreProducts(StoreID='${encodeURIComponent(activeStore?.sap_site_id ?? activeStore?.id ?? "")}',ProductID='${encodeURIComponent(sapArticleId)}')?$format=json`,
                              "GET", { Accept: "application/json" });
                            console.log("[Test SAP] Proxy response:", proxyResponse);
                            if (!proxyResponse.success) throw new Error(proxyResponse.error || "Proxy failed");
                            const jsonStr = proxyResponse.data ?? "";
                            const parsed = JSON.parse(jsonStr);
                            return parsed.d || null;
                          })()
                        : await fetchSapProductData(activeStore?.sap_site_id ?? activeStore?.id ?? "", sapArticleId);
                      console.log("[Test SAP] SAP data:", sapData);
                      if (!sapData) { toast.error("Inga data från SAP för artikel: " + sapArticleId); return; }
                      const shelfLifeDays = parseInt(sapData.RemainingShelfLifeInDays, 10);
                      if (Number.isNaN(shelfLifeDays)) { toast.error("Ogiltigt hållbarhetsdatum från SAP."); return; }
                      const { error } = await supabase.from("product_shelf_life").upsert({
                        sap_article_id: sapArticleId, shelf_lifetime_days: shelfLifeDays,
                        updated_at: new Date().toISOString(),
                      }, { onConflict: "sap_article_id" });
                      if (error) { console.error("[Test SAP] Supabase error:", error); toast.error("Kunde inte spara till Supabase."); }
                      else { toast.success("Sparade hållbarhetsdata (" + shelfLifeDays + " dagar) för " + sapArticleId); console.log("[Test SAP] Saved to Supabase successfully"); }
                    } catch (err: any) { console.error("[Test SAP] Exception:", err); toast.error("Fel vid SAP-test: " + (err?.message || err)); }
                  }}
                  disabled={isLoading}>Testa SAP → Supabase</Button>
              </div>
            </div>
        </Card>
      )}
      {step === "dashboard" && (
        <div className="space-y-6">
          <section className="rounded-2xl bg-emerald-700 p-6 text-white shadow-sm md:p-8">
            <div>
              <h2 className="mt-2 text-4xl font-semibold">Hej!</h2>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-3">
                <CardDescription>REKLAMATION</CardDescription>
                <CardTitle className="flex items-center gap-2 text-3xl text-red-600">
                  {reclaimedProductCount} <TrendingDown size={20} />
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  {totalProductCount > 0
                    ? Math.round((reclaimedProductCount / totalProductCount) * 100)
                    : 0}
                  % av totalt
                </span>
                <Button
                  variant="link"
                  className="h-auto p-0"
                  onClick={() => setStep("reclamations")}
                >
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
              <CardContent className="text-sm text-muted-foreground">
                {productPercentage}% av totalt
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardDescription>TOTALT</CardDescription>
                <CardTitle className="flex items-center gap-2 text-3xl">
                  {totalProductCount} <Box size={20} />
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Alla aktiva produkter
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <Card className="min-h-64">
              <CardHeader>
                <CardTitle>Fördelning</CardTitle>
              </CardHeader>
              <CardContent>
                {shelfLifeRecords.length > 0 ? (
                  <div className="space-y-3">
                    {Object.entries(
                      shelfLifeRecords.reduce<Record<string, number>>((counts, record) => {
                        const flow = getMappedFlow(record.category);
                        counts[flow] = (counts[flow] ?? 0) + 1;
                        return counts;
                      }, {}),
                    ).map(([flow, count]) => (
                      <div
                        key={flow}
                        className="flex justify-between border-b py-2 text-sm last:border-0"
                      >
                        <span>{flow}</span>
                        <strong>{count}</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex min-h-40 flex-col items-center justify-center text-center text-muted-foreground">
                    <Package size={34} className="mb-3 opacity-50" />
                    <p>Ingen data ännu</p>
                  </div>
                )}
              </CardContent>
            </Card>
            <Card className="min-h-64">
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Senaste leveranserna</CardTitle>
                <Badge variant="outline">Senaste 5</Badge>
              </CardHeader>
              <CardContent>
                {deliveryStatistics.length > 0 ? (
                  <div className="space-y-2">
                    {deliveryStatistics.slice(0, 5).map((delivery, index) => (
                      <div
                        key={`${delivery.sap_article_id}-${delivery.arrival_date}-${index}`}
                        className="flex items-center justify-between border-b py-2 last:border-0"
                      >
                        <div>
                          <p className="font-medium">{delivery.product_name}</p>
                          <p className="font-mono text-xs text-muted-foreground">
                            {delivery.sap_article_id}
                          </p>
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {delivery.arrival_date
                            ? new Date(delivery.arrival_date).toLocaleDateString("sv-SE")
                            : "Datum saknas"}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex min-h-40 flex-col items-center justify-center text-center text-muted-foreground">
                    <Upload size={34} className="mb-3 opacity-50" />
                    <p>Inga leveranser ännu.</p>
                    <p className="text-sm">Ladda upp en följesedel för att komma igång.</p>
                  </div>
                )}
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

            {importDates.length > 0 && (
              <div className="mb-4">
                <Label className="text-sm font-medium text-muted-foreground">
                  Senaste importerade leveransdatum
                </Label>
                <div className="mt-1 flex flex-wrap gap-2">
                  {importDates.slice(0, 20).map((date) => (
                    <Button
                      key={date}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="font-mono text-xs"
                      onClick={() => setShelfLifeSearch(date)}
                    >
                      {date}
                    </Button>
                  ))}
                </div>
              </div>
            )}

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
            <Input
              value={shelfLifeSearch}
              onChange={(event) => setShelfLifeSearch(event.target.value)}
              placeholder="Sök produkt, varumärke, hållbarhet, datum eller status..."
              aria-label="Sök i hållbarhetsdata"
            />
            <p className="text-sm text-muted-foreground">
              Visar {filteredShelfLifeRecords.length} av {shelfLifeRecords.length} artiklar
            </p>
            <div className="flex gap-4">
              <Button
                type="button"
                variant={hideOkRecords ? "default" : "outline"}
                size="sm"
                onClick={() => setHideOkRecords(!hideOkRecords)}
              >
                {hideOkRecords ? "Visa OK" : "Dölj OK"}
              </Button>
              {shelfLifeSort.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShelfLifeSort([])}
                >
                  Rensa sortering
                </Button>
              )}
              {sapExtensionChecked && sapExtensionInstalled && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void importShelfLifeFromSap()}
                  disabled={isLoading}
                >
                  Hämta från SAP
                </Button>
              )}
            </div>
            {shelfLifeSort.length > 0 && (
              <div className="mt-2 text-xs text-muted-foreground flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">Sortering:</span>
                {shelfLifeSort.map((entry, i) => (
                  <span
                    key={`${entry.key}-${i}`}
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800"
                  >
                    <span>{entry.direction === "asc" ? "↑" : "↓"}</span>
                    <span>
                      {entry.key === "shelf_lifetime_days"
                        ? "Hållbarhet"
                        : entry.key === "status"
                          ? "Status"
                          : entry.key === "expiry_date"
                            ? "Bäst-före"
                            : entry.key === "arrival_date"
                              ? "Leverans"
                              : entry.key === "product_name"
                                ? "Produkt"
                                : entry.key === "brand"
                                  ? "Varumärke"
                                  : entry.key}
                    </span>
                    <span className="ml-0.5 text-[10px] font-bold">{i + 1}</span>
                  </span>
                ))}
              </div>
            )}
            {shelfLifeRecords.length > 0 ? (
              <div
                className="border rounded-lg overflow-hidden"
                style={{ height: "500px" }}
              >
                <div
                  className="overflow-auto h-full"
                  onScroll={(e) =>
                    setShelfLifeScrollTop(e.currentTarget.scrollTop)
                  }
                >
                  <Table>
                    <TableHeader>
                     <TableRow>
                       <TableHead>SAP Produkt-ID</TableHead>
                       {(
                         [
                           ["Produkt", "product_name"],
                           ["Varumärke", "brand"],
                           ["Total hållbarhet (dagar)", "shelf_lifetime_days"],
                           ["Bäst-före-datum", "expiry_date"],
                           ["Leveransdatum", "arrival_date"],
                           ["Status", "status"],
                         ] as [string, ShelfLifeSortKey][]
                        ).map(([label, key], idx) => {
                          const sortEntry = shelfLifeSort.find((s) => s.key === key);
                          const sortOrder = shelfLifeSort.findIndex((s) => s.key === key);
                          return (
                            <TableHead key={key}>
                              <div className="flex items-center gap-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-auto px-0 font-medium"
                                onClick={(e) => {
                                  if (e.shiftKey) {
                                    e.preventDefault();
                                    if (sortEntry) {
                                      moveSortToFront(key);
                                    } else {
                                      toggleShelfLifeSort(key, true);
                                    }
                                  } else {
                                    toggleShelfLifeSort(key, false);
                                  }
                                }}
                                >
                                  {label}
                                  {sortEntry ? (
                                    sortEntry.direction === "asc" ? (
                                      <TrendingUp size={14} className="ml-1" />
                                    ) : (
                                      <TrendingDown size={14} className="ml-1" />
                                    )
                                  ) : (
                                    <ArrowUpDown size={14} className="ml-1 opacity-30" />
                                  )}
                                  {sortOrder >= 0 && (
                                    <Badge variant="outline" className="ml-1 h-5 w-5 p-0 text-xs rounded-full justify-center items-center leading-none">
                                      {sortOrder + 1}
                                    </Badge>
                                  )}
                                </Button>
                                {sortEntry && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-auto w-auto p-0 opacity-50 hover:opacity-100"
                                    onClick={() => removeShelfLifeSort(key)}
                                    title="Ta bort sortering"
                                  >
                                    <X size={12} />
                                  </Button>
                                )}
                              </div>
                            </TableHead>
                          );
                        })}
                     </TableRow>
                   </TableHeader>
                    <TableBody>
                      {filteredShelfLifeRecords.map((record, idx) => {
                        const _bufferStart = Math.max(0, Math.floor(shelfLifeScrollTop / 36) - 10);
                        const _bufferEnd = Math.min(filteredShelfLifeRecords.length, Math.floor(shelfLifeScrollTop / 36) + Math.ceil(500 / 36) + 10);
                        if (idx < _bufferStart || idx > _bufferEnd) {
                          return (
                            <TableRow key={record.id} className="h-[36px]">
                              <TableCell colSpan={7} className="py-0" />
                            </TableRow>
                          );
                        }
                        const arrival = new Date(record.arrival_date);
                        const expiry = new Date(record.expiry_date);
                        const hasValidDates =
                          Boolean(record.arrival_date) &&
                          Boolean(record.expiry_date) &&
                          !Number.isNaN(arrival.getTime()) &&
                          !Number.isNaN(expiry.getTime());
                        const daysRemaining = hasValidDates
                          ? Math.floor((expiry.getTime() - arrival.getTime()) / (1000 * 60 * 60 * 24))
                          : null;
                        const hasShelfLife =
                         Number.isFinite(record.shelf_lifetime_days) &&
                         record.shelf_lifetime_days > 0;
                       const assessment = assessDelivery(
                         record.arrival_date,
                         record.expiry_date,
                         record.shelf_lifetime_days,
                       );
                       const isFlagged = assessment?.isEligible ?? false;

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
                          <TableCell
                            onDoubleClick={() => {
                              setEditingShelfLifeId(record.id);
                              setEditingShelfLifeValue(String(record.shelf_lifetime_days || ""));
                            }}
                            className="cursor-text"
                            title="Dubbelklicka för att ändra"
                          >
                            {editingShelfLifeId === record.id ? (
                              <Input
                                autoFocus
                                type="number"
                                min="1"
                                value={editingShelfLifeValue}
                                onChange={(event) => setEditingShelfLifeValue(event.target.value)}
                                onBlur={() =>
                                  void saveInlineShelfLife(record, editingShelfLifeValue)
                                }
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") event.currentTarget.blur();
                                  if (event.key === "Escape") setEditingShelfLifeId(null);
                                }}
                                className="h-8 w-28"
                              />
                            ) : (
                              record.shelf_lifetime_days || "Ej angiven"
                            )}
                          </TableCell>
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
                        </TableRow>
                      );
                    })}
                  </TableBody>
                    </Table>
                    {filteredShelfLifeRecords.length === 0 && (
                      <p className="py-8 text-center text-sm text-muted-foreground">
                        Inga artiklar matchar sökningen.
                      </p>
                    )}
                  </div>
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
              {eligibleShelfLifeRecords.length > 0 ? (
                <div className="max-h-64 overflow-y-auto text-sm">
                  {eligibleShelfLifeRecords.map((record) => {
                    const assessment = assessDelivery(
                      record.arrival_date,
                      record.expiry_date,
                      record.shelf_lifetime_days,
                    );
                    return (
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
                          <div className="text-xs">
                            Anledning: Kvarvarande {assessment?.daysRemaining} dagar är under
                            miniminivån {assessment?.minimumDays} dagar
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : hasImportedDeliveries ? (
                <p className="text-sm text-muted-foreground">
                  Inga leveranser understiger Coop:s hållbarhetskrav just nu.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Ingen leverans är importerad ännu.</p>
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
              <p className="text-muted-foreground">
                Din butiks reklamationer och återförda värden över tid.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={statisticsPeriod}
                onValueChange={(value) => {
                  const nextPeriod = value as typeof statisticsPeriod;
                  setStatisticsPeriod(nextPeriod);
                  void loadDeliveryStatistics(nextPeriod);
                }}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ytd">Hittills i år</SelectItem>
                  <SelectItem value="last30">Senaste 30 dagarna</SelectItem>
                  <SelectItem value="last12">Senaste 12 månaderna</SelectItem>
                </SelectContent>
              </Select>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() =>
                  exportTextAsCSV(
                    "statistik.csv",
                    `period,totalt,skickade,avgjorda,godkanda\n${statisticsPeriod},${replacementStatistics?.totalCount ?? 0},${replacementStatistics?.sentCount ?? 0},${replacementStatistics?.decidedCount ?? 0},${replacementStatistics?.approvedCount ?? 0}`,
                  )
                }
              >
                <Download size={16} /> Exportera
              </Button>
            </div>
          </div>

          {replacementStatistics && (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Card className="border-emerald-200 bg-emerald-50/70">
                  <CardHeader className="pb-2">
                    <CardDescription>ÅTERFÖRT VÄRDE</CardDescription>
                    <CardTitle className="text-3xl text-emerald-700">
                      {formatSek(replacementStatistics.returnedValue)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    perioden pågår
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>EJ FÄRDIGA REKLAMATIONERS VÄRDE</CardDescription>
                    <CardTitle className="text-3xl">
                      {formatSek(replacementStatistics.pendingValue)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    {replacementStatistics.sentCount} skickade reklamationer
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>GODKÄNNANDEGRAD</CardDescription>
                    <CardTitle className="text-3xl">
                      {replacementStatistics.approvalRate}%
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    {replacementStatistics.approvedCount} av {replacementStatistics.decidedCount}{" "}
                    avgjorda
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>SNITT PER GODKÄND</CardDescription>
                    <CardTitle className="text-3xl">
                      {formatSek(replacementStatistics.averageApprovedValue)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    {replacementStatistics.totalCount} reklamationer totalt
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <div>
                    <CardTitle>Återfört över tid</CardTitle>
                    <CardDescription>Godkänt värde per månad</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={statisticsView === "value" ? "default" : "outline"}
                      onClick={() => setStatisticsView("value")}
                    >
                      Värde
                    </Button>
                    <Button
                      size="sm"
                      variant={statisticsView === "count" ? "default" : "outline"}
                      onClick={() => setStatisticsView("count")}
                    >
                      Antal
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={replacementStatistics.monthly}
                        margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" />
                        <YAxis allowDecimals={false} />
                        <Tooltip />
                        <Line
                          type="monotone"
                          dataKey={statisticsView}
                          stroke="#059669"
                          strokeWidth={3}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Vald period:{" "}
                    {statisticsPeriod === "ytd"
                      ? "Hittills i år"
                      : statisticsPeriod === "last30"
                        ? "Senaste 30 dagarna"
                        : "Senaste 12 månaderna"}{" "}
                    - pågående period (ej hel)
                  </p>
                </CardContent>
              </Card>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Fördelning per flöde</CardTitle>
                    <CardDescription>
                      Färskvaru • Fryst • Torrt •{" "}
                      {statisticsPeriod === "ytd"
                        ? "Hittills i år"
                        : statisticsPeriod === "last30"
                          ? "Senaste 30 dagarna"
                          : "Senaste 12 månaderna"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {Object.entries(replacementStatistics.flowCounts).map(([flow, count]) => (
                      <div key={flow} className="flex justify-between text-sm">
                        <span>{flow}</span>
                        <strong>{count}</strong>
                      </div>
                    ))}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Återfört per kategori</CardTitle>
                    <CardDescription>
                      Fördelat på {Object.keys(replacementStatistics.categoryCounts).length}{" "}
                      varugrupper
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {Object.entries(replacementStatistics.categoryCounts).length > 0 ? (
                      Object.entries(replacementStatistics.categoryCounts).map(
                        ([category, count]) => (
                          <div key={category} className="flex justify-between text-sm">
                            <span>{category}</span>
                            <strong>{count}</strong>
                          </div>
                        ),
                      )
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Inga godkända reklamationer i perioden.
                      </p>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Återkommande varor</CardTitle>
                    <CardDescription>Produkter du reklamerar oftast</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {replacementStatistics.recurring.length > 0 ? (
                      replacementStatistics.recurring.map((item) => (
                        <div
                          key={item.sap_article_id}
                          className="flex justify-between gap-4 text-sm"
                        >
                          <span>{item.name}</span>
                          <strong>{item.count} st</strong>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">Inga återkommande varor ännu.</p>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Väntar på svar</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    {replacementStatistics.openCount > 0
                      ? `${replacementStatistics.openCount} öppna reklamationer`
                      : "Inga öppna reklamationer."}
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </div>
      )}

      {step === "category-mapping" && user.role === "admin" && (
        <Card>
          <CardHeader>
            <CardTitle>Koppla följesedelskategorier till flöden</CardTitle>
            <CardDescription>
              Välj vilket ersättningsflöde varje kategori från följesedlar ska tillhöra. Mappningen
              används i statistik och när ersättningsfiler skapas.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {deliveryCategories.length > 0 ? (
              <div className="space-y-3">
                {deliveryCategories.map((category) => {
                  const mapping = categoryMappings.find((item) => item.category === category);
                  const isHidden = hiddenCategories.some(
                    (c) => c.toLowerCase() === category.toLowerCase(),
                  );
                  return (
                    <div
                      key={category}
                      className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => toggleHiddenCategory(category)}
                          title={
                            isHidden
                              ? "Visa produkter utan hållbarhetsdata"
                              : "Dölj produkter utan hållbarhetsdata"
                          }
                        >
                          {isHidden ? <EyeOff size={16} /> : <Eye size={16} />}
                        </Button>
                        <span className="font-medium">{category}</span>
                      </div>
                      <Select
                        value={mapping?.flow ?? "unmapped"}
                        onValueChange={(value) => {
                          if (value !== "unmapped") {
                            void saveCategoryMapping(category, value as DeliveryFlow);
                          }
                        }}
                        disabled={mappingLoading}
                      >
                        <SelectTrigger className="w-full sm:w-44">
                          <SelectValue placeholder="Välj flöde" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unmapped">Ej kopplad</SelectItem>
                          <SelectItem value="Färsk">Färsk</SelectItem>
                          <SelectItem value="Torrt">Torrt</SelectItem>
                          <SelectItem value="Fryst">Fryst</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>
             ) : (
               <div className="py-10 text-center text-muted-foreground">
                 <p>Inga kategorier från följesedlar finns ännu.</p>
                 <p className="mt-1 text-sm">Importera en följesedel för att börja koppla flöden.</p>
               </div>
             )}
           </CardContent>
         </Card>
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
            <CardDescription>Uppdatera status per reklamation.</CardDescription>
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
      <Dialog open={false} onOpenChange={(open) => !open && setSelectedWeeklyProduct(null)}>
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
