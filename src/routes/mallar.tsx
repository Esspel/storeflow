import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { Plus, Trash2, ChevronDown, ChevronUp, Download, GripVertical, Upload, X, Repeat, Clock, TriangleAlert as AlertTriangle, Pencil, Store as StoreIcon, Building2, Eye, EyeOff, Search, History, GitBranch, Copy, Layers, CircleCheck as CheckCircle, ListChecks, CalendarClock, Users, ExternalLink, Hash, Zap, Truck, Link2 } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  supabase, type ChecklistTemplate, type ChecklistTemplateItem,
  type ChecklistTemplateQuestion, type Store, type Forening,
  type TemplateVersion, type TemplatePackage, type TemplatePackageItem, type AppUser, type UserGroup, logAudit, mittCoopUrl, mittCoopSearchUrl,
  type ArticleIdType,
} from "@/lib/supabase";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth-context";
import { ImportDialog, type ImportDialogResult } from "@/components/import-dialog";
import { cn, ensureHttps, sanitizeCsvCell } from "@/lib/utils";
import { spawnChildrenForParent } from "@/lib/task-utils";
import { toast } from "sonner";

const RECURRENCE_OPTIONS = [
  { value: "", label: "Ingen" },
  { value: "daily", label: "Dagligen" },
  { value: "every_other_day", label: "Varannan dag" },
  { value: "weekly", label: "Varje vecka" },
  { value: "biweekly", label: "Varannan vecka" },
  { value: "monthly", label: "Varje månad" },
  { value: "quarterly", label: "Kvartalsvis" },
  { value: "yearly", label: "Varje år" },
  { value: "custom", label: "Anpassat intervall" },
];
const WEEKDAYS = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"];
const MONTHS_SV = ["Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"];
const QUARTER_MONTHS = [
  { q: "Q1", months: [0, 1, 2] },
  { q: "Q2", months: [3, 4, 5] },
  { q: "Q3", months: [6, 7, 8] },
  { q: "Q4", months: [9, 10, 11] },
];

// Instruction header injected into every downloadable CSV template.
// Lines starting with '#' are treated as comments and skipped by the importer.
const CSV_TEMPLATE_INSTRUCTIONS = `# INSTRUKTIONER (dessa rader ignoreras vid import)
# Kolumner (0-30):
#   0:Titel  1:Kategori  2:Beskrivning  3:Prioritet  4:Status  5:Version
#   6:Återkommande  7:Veckodagar  8:Månader  9:Månadsdag  10:Intervall
#   11:Förfaller om (dagar)  12:Förfallotid (HH:MM)  13:Startdatum  14:Slutdatum
#   15:Ursprungsmall  16:Arvläge  17:Steg (detaljer)  18:Frågor  19:Tidsluckor (HH:MM)
#   20:SAP-artikel  21:Mallpaket  22:Händelsevillkor  23:Leveransuppgift (ja/nej)
#   24:Leveransflöde  25:Kedja (beror på mallnamn)  26:Malltyp  27:Skapningsläge
#   28:Händelse-bekräftare  29:Granskningsintervall (månader)  30:Kritisk (ja/nej)  31:Leveransföretag
#
# Prioritet: Låg | Medel | Hög | Kritisk
# Status: active | review | deprecated | archived  (lämna tomt för active)
# Version: heltal — lämna tomt, sätts automatiskt
#
# Återkommande: daily | every_other_day | weekly | biweekly | monthly | quarterly | yearly
# Veckodagar: kommaseparerade 0–6 (0=Mån … 6=Sön) — används när Återkommande=weekly/biweekly
#   Exempel: 0,1,4  (Mån, Tis, Fre)
# Månader: kommaseparerade månadsnummer 1–12 — används när Återkommande=yearly (specifika månader)
#   Exempel: 1,4,7,10  (jan, apr, jul, okt)
# Månadsdag: dag i månaden 1–31 — används när Återkommande=monthly/yearly
# Intervall: enheter mellan upprepningar (t.ex. 2 = varannan), lämna tomt för 1
# Startdatum/Slutdatum: ÅÅÅÅ-MM-DD
# Ursprungsmall: ID för föräldramall vid arv (lämna tomt)
# Arvläge: copy | variant (lämna tomt)
# Förfaller om (dagar): antal dagar från skapandet tills uppgiften förfaller
# Förfallotid (HH:MM): klockslag — ANVÄNDS INTE om Tidsluckor är ifylld
#
# Steg: pipe-separerade (|) checkpunkter
#   [foto]               — kräver fotobevis
#   [url:https://...]    — länk till extern sida
#   [om:FrågeLabel=ja]   — steget visas bara om frågan besvarats med "ja"
#   [om:FrågeLabel=nej]  — steget visas bara om frågan besvarats med "nej"
#   Frågelabeln måste matcha exakt en fråga i Frågor-kolumnen
#   Exempel:
#     "1. Torka hyllor | 2. Dammsuga [foto] | 3. Åtgärda fel [om:Finns avvikelser?=ja]"
#
# Frågor: pipe-separerade frågor
#   [obligatorisk]  — måste besvaras innan uppgiften kan slutföras
#   [ja_nej]        — ger Ja/Nej-knappar istället för fritextfält (krävs för villkorliga steg)
#   [url:https://...] — länk till extern sida
#   Exempel:
#     "1. Finns avvikelser? [obligatorisk] [ja_nej] | 2. Kommentar"
#
# Tidsluckor (HH:MM): pipe-separerade klockslag — EN UPPGIFT skapas per tidslucka
#   Förfallotid ignoreras om Tidsluckor är ifylld
#   Exempel: "08:00 | 12:00 | 16:00"
#
# Mallpaket (kol 21): namn på det mallpaket mallen ska ingå i — skapas automatiskt
#   Exempel: "Öppningspaket"
#
# Händelsevillkor (kol 22): beskrivning av den händelse som måste bekräftas av ansvarig
#   Uppgiften är helt dold för alla tills händelsen bekräftats för dagen
#   Exempel: "Andel inkommen" eller "Truck lossat"
#
# Leveransuppgift (kol 23): ja | (tomt) — om "ja" genereras uppgiften automatiskt från
#   dagens leveransplan när mallen tillämpas; en uppgift per leverans
#
# Leveransflöde (kol 24): filtrera leveranser på flödesnamn (t.ex. Färskt | Torrt | Fryst | Standard)
#   Lämna tomt för att visa alla flöden i leveransmodalen
#
# Kedja (kol 25): titel på föregångarmallen — uppgiften blockeras (visas som "Blockerad")
#   tills föregångaren är markerad som klar; matchas mot aktiva uppgifter vid skapande
#   Exempel: "Öppningskontroll"
#
# Malltyp (kol 26): grundmall | regular (lämna tomt för regular)
#   Leveransmallar sätts automatiskt till grundmall
#
# Skapningsläge (kol 27): batch_only | manual_only | both (lämna tomt för both)
#   batch_only  — visas bara i batchguiden, inte i manuellt skapande
#   manual_only — visas bara i formuläret, aldrig i batchguiden
#   both        — tillgänglig i båda flödena (standard)
#
# Händelse-bekräftare (kol 28): UUID för den användare som ska bekräfta händelsevillkoret
#   Lämna tomt om bekräftaren väljs vid tillämpning
#
# Granskningsintervall (kol 29): antal månader mellan granskningar (lämna tomt för 24)
#   Används enbart för grundmallar (template_type=base)
#
# Kritisk (kol 30): ja | (tomt) — kritiska mallar blockeras från automatisk arkivering
#   och kräver chefsbeslut vid granskning
#
# Tips: Spara i UTF-8 och använd semikolon (;) som separator
`;

const TEMPLATE_STATUS_OPTIONS = [
  { value: "active", label: "Aktiv", cls: "bg-success/15 text-success border-success/30" },
  { value: "review", label: "Under granskning", cls: "bg-warning/15 text-warning-foreground border-warning/30" },
  { value: "deprecated", label: "Utfasad", cls: "bg-muted text-muted-foreground border-border" },
  { value: "archived", label: "Arkiverad", cls: "bg-muted/50 text-muted-foreground/60 border-border/50" },
];

type TemplateWithMeta = ChecklistTemplate & {
  storeIds: string[];
  questions: ChecklistTemplateQuestion[];
};

type HiddenEntry = { forening_id: string; template_id: string };

type FormState = {
  title: string;
  description: string;
  category: string;
  priority: string;
  status: "active" | "review" | "deprecated" | "archived";
  template_type: "regular" | "base";
  template_mode: "batch_only" | "manual_only" | "both";
  is_critical: boolean;
  review_interval_months: number;
  recurrence_rule: string;
  recurrence_days: number[];
  recurrence_interval: number;
  recurrence_months: number[];
  recurrence_month_day: number;
  recurrence_start: string;
  recurrence_end: string;
  due_date_offset: string;
  due_date_time: string;
  sap_article_id: string;
  time_slots: string[];
  storeIds: string[];
  isGlobal: boolean;
  isLocked: boolean;
  foreningId: string;
  changeSummary: string;
  event_trigger_description: string;
  event_trigger_user_id: string;
  is_delivery_task: boolean;
  delivery_flow_name: string;
  delivery_supplier_name: string;
  delivery_entry_keys: string;
  depends_on_template_title: string;
  items: { id?: string; label: string; requires_photo: boolean; link_url?: string; condition_question_id?: string; condition_answer?: string }[];
  questions: { id?: string; label: string; question_type: "text" | "yes_no"; is_required: boolean; link_url?: string }[];
};

const emptyForm = (): FormState => ({
  title: "", description: "", category: "", priority: "Medel",
  status: "active",
  template_type: "regular",
  template_mode: "both",
  is_critical: false,
  review_interval_months: 24,
  recurrence_rule: "", recurrence_days: [], recurrence_interval: 1,
  recurrence_months: [], recurrence_month_day: 1,
  recurrence_start: "", recurrence_end: "",
  due_date_offset: "", due_date_time: "", sap_article_id: "", time_slots: [],
  storeIds: [], isGlobal: false, isLocked: false, foreningId: "",
  changeSummary: "",
  event_trigger_description: "",
  event_trigger_user_id: "",
  is_delivery_task: false,
  delivery_flow_name: "",
  delivery_supplier_name: "",
  delivery_entry_keys: "",
  depends_on_template_title: "",
  items: [{ label: "", requires_photo: false, link_url: "" }],
  questions: [],
});

export const Route = createFileRoute("/mallar")({
  component: MallarPage,
});

function MallarPage() {
  const { user, activeStore, userStores } = useAuth();

  const isAdmin = user?.role === "admin";
  const isHK = user?.hierarchy_level === "hk" || isAdmin;
  const isForening = user?.hierarchy_level === "forening";
  const isManager = user?.role === "manager" || isAdmin;
  // Förening users can manage forening-scoped templates; HK/admin manage HK-scoped
  const canCreateForening = isForening || isAdmin;
  const canCreateHK = isHK; // admin counts as HK too

  const [templates, setTemplates] = useState<TemplateWithMeta[]>([]);
  const [allStores, setAllStores] = useState<Store[]>([]);
  const [allForeningar, setAllForeningar] = useState<Forening[]>([]);
  const [hiddenEntries, setHiddenEntries] = useState<HiddenEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createScope, setCreateScope] = useState<"store" | "hk" | "forening">("store");
  const [deleteTarget, setDeleteTarget] = useState<TemplateWithMeta | null>(null);
  const [editTarget, setEditTarget] = useState<TemplateWithMeta | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [broadcastConfirm, setBroadcastConfirm] = useState<"create" | "edit" | null>(null);

  const [form, setForm] = useState<FormState>(emptyForm());
  const [editForm, setEditForm] = useState<FormState>(emptyForm());
  const [mallArticleType, setMallArticleType] = useState<ArticleIdType>("mat-nr");
  const [mallArticlePrompt, setMallArticlePrompt] = useState<string | null>(null);

  const [importing, setImporting] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);

  // Version history
  const [versionHistoryTarget, setVersionHistoryTarget] = useState<TemplateWithMeta | null>(null);
  const [versions, setVersions] = useState<TemplateVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [restoreConfirm, setRestoreConfirm] = useState<TemplateVersion | null>(null);

  // Inherit / copy dialog
  const [inheritTarget, setInheritTarget] = useState<TemplateWithMeta | null>(null);
  const [inheritMode, setInheritMode] = useState<"copy" | "variant">("copy");

  // Bulk operations
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<Set<string>>(new Set());
  const [bulkDeleteTemplatesOpen, setBulkDeleteTemplatesOpen] = useState(false);

  // Bulk task creation wizard
  type BulkTaskConfig = {
    templateId: string;
    assigneeUserIds: string[];
    assigneeGroupIds: string[];
    eventTriggerUserId: string;
    // For delivery templates: which delivery entry ids to create tasks for
    selectedDeliveryIds: string[];
  };
  const [bulkCreateOpen, setBulkCreateOpen] = useState(false);
  const [bulkTaskConfigs, setBulkTaskConfigs] = useState<BulkTaskConfig[]>([]);
  const [bulkCreating, setBulkCreating] = useState(false);
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [allGroups, setAllGroups] = useState<UserGroup[]>([]);

  // Template preview
  const [previewTarget, setPreviewTarget] = useState<TemplateWithMeta | null>(null);

  // Template packages
  const [packages, setPackages] = useState<TemplatePackage[]>([]);
  const [showPackagesPanel, setShowPackagesPanel] = useState(false);
  const [showPackagesInline, setShowPackagesInline] = useState(false);
  const [packageForm, setPackageForm] = useState({ name: "", description: "" });
  const [packageTemplateIds, setPackageTemplateIds] = useState<string[]>([]);
  const [editPackageTarget, setEditPackageTarget] = useState<TemplatePackage | null>(null);
  const [activatePackageTarget, setActivatePackageTarget] = useState<TemplatePackage | null>(null);

  // Merge: when a parent HK/forening template has been updated after a local variant was created
  const [mergeTarget, setMergeTarget] = useState<{ variant: TemplateWithMeta; parent: TemplateWithMeta } | null>(null);
  const [merging, setMerging] = useState(false);

  // 24-month review system
  const [reviewTarget, setReviewTarget] = useState<TemplateWithMeta | null>(null);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewEndDate, setReviewEndDate] = useState("");

  // CSV delivery supplier mapping
  type DeliveryMappingItem = { templateId: string; templateTitle: string; entryKeys: string[] };
  const [deliveryMappingOpen, setDeliveryMappingOpen] = useState(false);
  const [deliveryMappingItems, setDeliveryMappingItems] = useState<DeliveryMappingItem[]>([]);
  // Template config picker: unique supplier+flow combos across all plans
  const [deliverySuppliers, setDeliverySuppliers] = useState<{ id: string; supplier: string; flow_name: string; delivery_time: string }[]>([]);
  // Batch create picker: full entries from current plan with day + time
  const [deliveryWeekEntries, setDeliveryWeekEntries] = useState<{ id: string; supplier: string; flow_name: string; delivery_time: string; delivery_day: string; delivery_date: string | null }[]>([]);
  const [deliveryMappingSaving, setDeliveryMappingSaving] = useState(false);
  const [deliveryFlowNames, setDeliveryFlowNames] = useState<string[]>([]);

  // View filter: "all" | "hk" | "forening" | "store"
  const [viewFilter, setViewFilter] = useState<"all" | "hk" | "forening" | "store">("all");
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterPriority, setFilterPriority] = useState("");

  useEffect(() => { load(); }, [user, activeStore]);

  // When editing a template that has supplier/flow config but no entry keys (old format),
  // backfill delivery_entry_keys from the current week's entries so the picker shows correctly.
  useEffect(() => {
    if (!editTarget || deliveryWeekEntries.length === 0) return;
    setEditForm(prev => {
      if (!prev.is_delivery_task) return prev;
      if (prev.delivery_entry_keys) return prev; // already has keys
      if (!prev.delivery_supplier_name && !prev.delivery_flow_name) return prev;
      const tmplFlows = prev.delivery_flow_name.split("|").map(s => s.trim().toLowerCase()).filter(Boolean);
      const tmplSuppliers = prev.delivery_supplier_name.split("|").map(s => s.trim().toLowerCase()).filter(Boolean);
      const matchedEntries = deliveryWeekEntries.filter(e => {
        const flowOk = tmplFlows.length === 0 || tmplFlows.includes(e.flow_name?.toLowerCase() ?? "");
        const suppOk = tmplSuppliers.length === 0 || tmplSuppliers.includes(e.supplier?.toLowerCase() ?? "");
        return flowOk && suppOk;
      });
      if (matchedEntries.length === 0) return prev;
      return {
        ...prev,
        delivery_entry_keys: matchedEntries.map(e => `${e.delivery_day}||${e.supplier?.trim()}||${e.flow_name?.trim()}`).join("|"),
      };
    });
  }, [editTarget, deliveryWeekEntries]);

  // Same backfill for the create form when delivery_entry_keys is empty but supplier/flow are set.
  useEffect(() => {
    if (deliveryWeekEntries.length === 0) return;
    setForm(prev => {
      if (!prev.is_delivery_task) return prev;
      if (prev.delivery_entry_keys) return prev;
      if (!prev.delivery_supplier_name && !prev.delivery_flow_name) return prev;
      const tmplFlows = prev.delivery_flow_name.split("|").map(s => s.trim().toLowerCase()).filter(Boolean);
      const tmplSuppliers = prev.delivery_supplier_name.split("|").map(s => s.trim().toLowerCase()).filter(Boolean);
      const matchedEntries = deliveryWeekEntries.filter(e => {
        const flowOk = tmplFlows.length === 0 || tmplFlows.includes(e.flow_name?.toLowerCase() ?? "");
        const suppOk = tmplSuppliers.length === 0 || tmplSuppliers.includes(e.supplier?.toLowerCase() ?? "");
        return flowOk && suppOk;
      });
      if (matchedEntries.length === 0) return prev;
      return {
        ...prev,
        delivery_entry_keys: matchedEntries.map(e => `${e.delivery_day}||${e.supplier?.trim()}||${e.flow_name?.trim()}`).join("|"),
      };
    });
  }, [deliveryWeekEntries]);

  async function load() {
    setLoading(true);
    const [templatesRes, storesRes, tsRes, foreningarRes, hiddenRes, usersRes, groupsRes, packagesRes] = await Promise.all([
      supabase.from("checklist_templates")
        .select("*, items:checklist_template_items(*), questions:checklist_template_questions(*)")
        .order("created_at", { ascending: false }),
      supabase.from("stores").select("*").order("name"),
      supabase.from("template_stores").select("template_id, store_id"),
      supabase.from("foreningar").select("*").order("name"),
      supabase.from("forening_hidden_templates").select("forening_id, template_id"),
      supabase.from("app_users").select("id, display_name, role, store_id").order("display_name"),
      supabase.from("user_groups").select("id, name, store_id").order("name"),
      supabase.from("template_packages").select("*, items:template_package_items(*)").order("name"),
    ]);

    const storeAssignments = (tsRes.data ?? []) as { template_id: string; store_id: string }[];
    const raw = (templatesRes.data ?? []) as ChecklistTemplate[];
    const withMeta: TemplateWithMeta[] = raw.map((t) => ({
      ...t,
      storeIds: storeAssignments.filter((a) => a.template_id === t.id).map((a) => a.store_id),
      questions: (t as typeof t & { questions?: ChecklistTemplateQuestion[] }).questions ?? [],
    }));

    const hidden = (hiddenRes.data ?? []) as HiddenEntry[];

    // Determine user's forening_id for filtering
    const userForeningId = user?.forening_id ?? null;
    // Stores the user belongs to
    const userStoreIds = userStores.map((s) => s.id);

    const filtered = withMeta.filter((t) => {
      const scope = t.hierarchy_scope;

      // HK-scope templates (is_global=true or hierarchy_scope='hk')
      if (scope === "hk" || t.is_global) {
        // Check if hidden by user's förening
        if (userForeningId && hidden.some((h) => h.template_id === t.id && h.forening_id === userForeningId)) {
          // Still show to forening users so they can manage the hide list
          return isForening || isAdmin;
        }
        return true;
      }

      // Förening-scope templates
      if (scope === "forening") {
        if (!t.forening_id) return false;
        if (isAdmin) return true;
        if (isForening && user?.forening_id === t.forening_id) return true;
        // Stores in the same förening see it
        if (userForeningId && userForeningId === t.forening_id) return true;
        // Direct store match via store's forening_id
        const userStoreForeningIds = allStores
          .filter((s) => userStoreIds.includes(s.id))
          .map((s) => s.forening_id);
        if (userStoreForeningIds.includes(t.forening_id)) return true;
        return false;
      }

      // Store-scope templates
      // Admins see unassigned templates
      if (t.storeIds.length === 0) {
        if (isAdmin) return true;
        // Also show to the creator so they can see their own orphaned template
        if (t.created_by && t.created_by === user?.id) return true;
        return false;
      }
      if (activeStore && t.storeIds.includes(activeStore.id)) return true;
      if (!activeStore && userStores.some((us) => t.storeIds.includes(us.id))) return true;
      return false;
    });

    setTemplates(filtered);
    setAllStores((storesRes.data ?? []) as Store[]);
    setAllForeningar((foreningarRes.data ?? []) as Forening[]);
    setHiddenEntries(hidden);
    setAllUsers((usersRes.data ?? []) as AppUser[]);
    setAllGroups((groupsRes.data ?? []) as UserGroup[]);
    setPackages((packagesRes.data ?? []) as TemplatePackage[]);

    // Load delivery entries for the flow + supplier pickers
    // Delivery plans are store-specific: load for the active store only
    const storeId = activeStore?.id ?? userStores[0]?.id ?? null;
    if (storeId) {
      const { data: planRows } = await supabase
        .from("delivery_plans").select("id").eq("store_id", storeId).order("imported_at", { ascending: false });
      const planIds = (planRows ?? []).map((p: { id: string }) => p.id);
      if (planIds.length > 0) {
        // Load ALL entries from ALL plans with full day+time info
        // Plans are ordered newest first — so when deduplicating, first match = most recent schedule
        type EntryRow = { id: string; supplier: string; flow_name: string; delivery_time: string; delivery_day: string; delivery_date: string | null; plan_id: string };
        const { data: allRows } = await supabase
          .from("delivery_entries")
          .select("id, supplier, flow_name, delivery_time, delivery_day, delivery_date, plan_id")
          .in("plan_id", planIds);

        // Sort by plan recency (planIds is sorted newest first)
        const planOrder = new Map(planIds.map((id, i) => [id, i]));
        const sorted = [...(allRows ?? []) as EntryRow[]].sort((a, b) =>
          (planOrder.get(a.plan_id) ?? 99) - (planOrder.get(b.plan_id) ?? 99)
        );

        // deliveryWeekEntries: one entry per unique (day+time+supplier+flow) — newest plan wins
        // This is the COMPLETE weekly delivery schedule (day + time are key info)
        const scheduleSeen = new Set<string>();
        const schedule = sorted.filter(e => {
          const key = `${e.delivery_day}||${e.delivery_time}||${e.supplier}||${e.flow_name}`;
          if (scheduleSeen.has(key)) return false;
          scheduleSeen.add(key);
          return true;
        });
        const dayOrder = ["Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag", "Söndag"];
        schedule.sort((a, b) => {
          const di = dayOrder.indexOf(a.delivery_day) - dayOrder.indexOf(b.delivery_day);
          return di !== 0 ? di : a.delivery_time.localeCompare(b.delivery_time);
        });
        setDeliveryWeekEntries(schedule);

        // deliverySuppliers: one entry per unique (supplier+flow) combo — for template config picker
        const comboSeen = new Set<string>();
        const combos = schedule.filter(e => {
          const key = `${e.supplier}||${e.flow_name}`;
          if (comboSeen.has(key)) return false;
          comboSeen.add(key);
          return true;
        }) as { id: string; supplier: string; flow_name: string; delivery_time: string }[];
        setDeliverySuppliers(combos);
        setDeliveryFlowNames([...new Set(combos.map(r => r.flow_name).filter(Boolean))]);
      }
    }

    setLoading(false);
  }

  async function saveVersionSnapshot(
    templateId: string,
    version: number,
    snapshot: unknown,
    summary: string,
  ) {
    await supabase.from("template_versions").insert({
      template_id: templateId,
      version,
      snapshot,
      change_summary: summary || "",
      saved_by: user?.id ?? null,
    });
  }

  async function loadVersionHistory(t: TemplateWithMeta) {
    setVersionHistoryTarget(t);
    setLoadingVersions(true);
    const { data } = await supabase
      .from("template_versions")
      .select("*")
      .eq("template_id", t.id)
      .order("version", { ascending: false });
    setVersions((data ?? []) as TemplateVersion[]);
    setLoadingVersions(false);
  }

  async function restoreVersion(ver: TemplateVersion) {
    if (!versionHistoryTarget) return;
    const snap = ver.snapshot as TemplateWithMeta & {
      template_type?: string; template_mode?: string; is_critical?: boolean;
      recurrence_start?: string; recurrence_end?: string; recurrence_interval?: number;
      sap_article_id?: string; time_slots?: string[];
      is_delivery_task?: boolean; delivery_flow_name?: string;
      delivery_supplier_name?: string; delivery_entry_keys?: string;
      event_trigger_description?: string; event_trigger_user_id?: string;
      depends_on_template_title?: string; review_interval_months?: number;
    };
    const newVersion = (versionHistoryTarget.version ?? 1) + 1;
    await supabase.from("checklist_templates").update({
      title: snap.title,
      description: snap.description ?? "",
      category: snap.category ?? "",
      priority: snap.priority ?? "Medel",
      status: snap.status ?? "active",
      template_type: snap.template_type ?? "regular",
      template_mode: snap.template_mode ?? "both",
      is_critical: snap.is_critical ?? false,
      recurrence_rule: snap.recurrence_rule ?? null,
      recurrence_days: snap.recurrence_days ?? null,
      recurrence_interval: snap.recurrence_interval ?? null,
      recurrence_start: snap.recurrence_start ?? null,
      recurrence_end: snap.recurrence_end ?? null,
      due_date_offset: snap.due_date_offset ?? null,
      due_date_time: snap.due_date_time ?? null,
      sap_article_id: snap.sap_article_id ?? null,
      time_slots: snap.time_slots ?? null,
      is_delivery_task: snap.is_delivery_task ?? false,
      delivery_flow_name: snap.delivery_flow_name ?? null,
      delivery_supplier_name: snap.delivery_supplier_name ?? null,
      delivery_entry_keys: snap.delivery_entry_keys ?? null,
      event_trigger_description: snap.event_trigger_description ?? null,
      event_trigger_user_id: snap.event_trigger_user_id ?? null,
      depends_on_template_title: snap.depends_on_template_title ?? null,
      review_interval_months: snap.review_interval_months ?? null,
      version: newVersion,
      updated_by: user?.id ?? null,
    }).eq("id", versionHistoryTarget.id);

    // Restore steps
    await supabase.from("checklist_template_items").delete().eq("template_id", versionHistoryTarget.id);
    const items = (snap.items ?? []).filter((it: ChecklistTemplateItem) => it.label.trim());
    if (items.length > 0) {
      await supabase.from("checklist_template_items").insert(
        items.map((it: ChecklistTemplateItem, idx: number) => ({ template_id: versionHistoryTarget.id, label: it.label, requires_photo: it.requires_photo, sort_order: idx }))
      );
    }

    await saveVersionSnapshot(
      versionHistoryTarget.id,
      newVersion,
      snap,
      `Återställd till version ${ver.version}`,
    );
    logAudit(user?.id ?? null, "template.restore", "checklist_templates", versionHistoryTarget.id, { restored_version: ver.version });
    setRestoreConfirm(null);
    setVersionHistoryTarget(null);
    await load();
  }

  async function createInheritedTemplate(source: TemplateWithMeta, mode: "copy" | "variant") {
    const isVariant = mode === "variant";
    const { data: tmpl } = await supabase.from("checklist_templates").insert({
      title: `${source.title} (${isVariant ? "variant" : "kopia"})`,
      description: source.description ?? "",
      category: source.category ?? "",
      priority: source.priority ?? "Medel",
      status: "active",
      recurrence_rule: source.recurrence_rule ?? null,
      recurrence_days: source.recurrence_days ?? null,
      recurrence_interval: source.recurrence_interval ?? null,
      due_date_offset: source.due_date_offset ?? null,
      due_date_time: source.due_date_time ?? null,
      created_by: user?.id ?? null,
      hierarchy_scope: source.hierarchy_scope ?? "store",
      is_global: source.is_global,
      parent_template_id: isVariant ? source.id : null,
      inherit_mode: isVariant ? "variant" : "copy",
      version: 1,
    }).select("id").maybeSingle();

    if (!tmpl?.id) return;

    const validItems = (source.items ?? []).filter(it => it.label.trim());
    if (validItems.length > 0) {
      await supabase.from("checklist_template_items").insert(
        validItems.map((it, idx) => ({ template_id: tmpl.id, label: it.label, requires_photo: it.requires_photo, sort_order: idx }))
      );
    }

    if (source.storeIds.length > 0) {
      const storeRows = source.storeIds.map(sid => ({ template_id: tmpl.id, store_id: sid }));
      await supabase.from("template_stores").insert(storeRows);
    }

    logAudit(user?.id ?? null, `template.${mode}`, "checklist_templates", tmpl.id, { source_id: source.id, mode });
    setInheritTarget(null);
    await load();
  }

  function toggleStore(id: string, list: string[], set: (ids: string[]) => void) {
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  async function savePackage() {
    if (!packageForm.name.trim()) return;
    const storeId = activeStore?.id ?? userStores[0]?.id ?? null;
    if (editPackageTarget) {
      await supabase.from("template_packages").update({ name: packageForm.name.trim(), description: packageForm.description.trim() }).eq("id", editPackageTarget.id);
      await supabase.from("template_package_items").delete().eq("package_id", editPackageTarget.id);
      if (packageTemplateIds.length > 0) {
        await supabase.from("template_package_items").insert(packageTemplateIds.map((tid, idx) => ({ package_id: editPackageTarget.id, template_id: tid, sort_order: idx })));
      }
      setEditPackageTarget(null);
    } else {
      const { data: pkg } = await supabase.from("template_packages").insert({ name: packageForm.name.trim(), description: packageForm.description.trim(), store_id: storeId, created_by: user?.id ?? null }).select("id").maybeSingle();
      if (pkg?.id && packageTemplateIds.length > 0) {
        await supabase.from("template_package_items").insert(packageTemplateIds.map((tid, idx) => ({ package_id: pkg.id, template_id: tid, sort_order: idx })));
      }
    }
    setPackageForm({ name: "", description: "" });
    setPackageTemplateIds([]);
    await load();
  }

  async function deletePackage(pkg: TemplatePackage) {
    await supabase.from("template_packages").delete().eq("id", pkg.id);
    await load();
  }

  function openEditPackage(pkg: TemplatePackage) {
    setEditPackageTarget(pkg);
    setPackageForm({ name: pkg.name, description: pkg.description ?? "" });
    setPackageTemplateIds((pkg.items ?? []).map(it => it.template_id));
    setShowPackagesPanel(true);
  }

  // Review actions
  async function handleReview(action: "continue" | "set_end_date" | "archive" | "edit") {
    if (!reviewTarget) return;
    if (action === "edit") {
      openEdit(reviewTarget as TemplateWithMeta);
      setReviewTarget(null);
      return;
    }
    setReviewSaving(true);
    const now = new Date().toISOString();
    const intervalMonths = (reviewTarget as ChecklistTemplate & { review_interval_months?: number }).review_interval_months ?? 24;
    const nextReview = (() => { const d = new Date(); d.setMonth(d.getMonth() + intervalMonths); return d.toISOString(); })();
    if (action === "continue") {
      await supabase.from("checklist_templates").update({
        last_reviewed_at: now,
        next_review_at: nextReview,
      }).eq("id", reviewTarget.id);
    } else if (action === "set_end_date" && reviewEndDate) {
      await supabase.from("checklist_templates").update({
        recurrence_end: reviewEndDate,
        last_reviewed_at: now,
        next_review_at: null,
      }).eq("id", reviewTarget.id);
    } else if (action === "archive") {
      await supabase.from("checklist_templates").update({
        status: "archived",
        last_reviewed_at: now,
        next_review_at: null,
      }).eq("id", reviewTarget.id);
    }
    logAudit(user?.id ?? null, "template.review", "checklist_templates", reviewTarget.id, { action, review_date: now });
    setReviewTarget(null);
    setReviewEndDate("");
    setReviewSaving(false);
    await load();
  }

  function openCreate(scope: "store" | "hk" | "forening") {
    setCreateScope(scope);
    const f = emptyForm();
    if (scope === "hk") { f.isGlobal = true; }
    if (scope === "forening") {
      f.foreningId = user?.forening_id ?? "";
    }
    setForm(f);
    setError("");
    setShowCreate(true);
  }

  async function createTemplate() {
    setError("");
    if (!form.title.trim()) { setError("Titel är obligatorisk."); return; }
    if (createScope === "forening" && !form.foreningId) {
      setError("Välj en förening.");
      return;
    }
    setSaving(true);

    const { data: tmpl } = await supabase.from("checklist_templates").insert({
      title: form.title.trim(),
      description: form.description.trim(),
      category: form.category.trim(),
      priority: form.priority,
      status: form.status,
      version: 1,
      owner_id: user?.id ?? null,
      recurrence_rule: form.recurrence_rule || null,
      recurrence_days: (form.recurrence_rule === "weekly" || form.recurrence_rule === "biweekly") && form.recurrence_days.length > 0 ? form.recurrence_days : null,
      recurrence_interval: form.recurrence_interval > 1 ? form.recurrence_interval : null,
      recurrence_start: form.recurrence_start || null,
      recurrence_end: form.recurrence_end || null,
      due_date_offset: form.due_date_offset !== "" ? (parseInt(form.due_date_offset, 10) || null) : null,
      due_date_time: form.due_date_time || null,
      sap_article_id: form.sap_article_id?.trim() || null,
      is_global: createScope === "hk",
      locked_by_admin: form.isLocked,
      hierarchy_scope: createScope,
      forening_id: createScope === "forening" ? form.foreningId : null,
      template_type: form.template_type,
      template_mode: form.template_mode,
      is_critical: form.is_critical,
      event_trigger_description: form.event_trigger_description?.trim() || null,
      event_trigger_user_id: form.event_trigger_user_id || null,
      is_delivery_task: form.is_delivery_task,
      delivery_flow_name: form.delivery_flow_name?.trim() || null,
      delivery_supplier_name: form.delivery_supplier_name?.trim() || null,
      delivery_entry_keys: form.delivery_entry_keys?.trim() || null,
      depends_on_template_title: form.depends_on_template_title?.trim() || null,
      review_interval_months: form.review_interval_months > 0 ? form.review_interval_months : null,
      // Set next_review_at for recurring base templates without a near end date
      next_review_at: (form.template_type === "base" && form.recurrence_rule && !form.recurrence_end)
        ? (() => { const d = new Date(); d.setMonth(d.getMonth() + (form.review_interval_months || 24)); return d.toISOString(); })()
        : null,
    }).select("id").maybeSingle();

    if (!tmpl?.id) { setSaving(false); return; }

    const validItems = form.items.filter((it) => it.label.trim());
    if (validItems.length > 0) {
      await supabase.from("checklist_template_items").insert(
        validItems.map((it, idx) => ({ template_id: tmpl.id, label: it.label.trim(), requires_photo: it.requires_photo, link_url: it.link_url || null, sort_order: idx, condition_question_id: it.condition_question_id ?? null, condition_answer: it.condition_answer ?? null }))
      );
    }

    if (createScope === "store") {
      const storeList = form.storeIds.length > 0 ? form.storeIds : activeStore ? [activeStore.id] : [];
      if (storeList.length > 0) {
        await supabase.from("template_stores").insert(storeList.map((sid) => ({ template_id: tmpl.id, store_id: sid })));
      }
    }

    const validQuestions = form.questions.filter((q) => q.label.trim());
    if (validQuestions.length > 0) {
      await supabase.from("checklist_template_questions").insert(
        validQuestions.map((q, idx) => ({ template_id: tmpl.id, label: q.label.trim(), question_type: q.question_type ?? "text", is_required: q.is_required, link_url: q.link_url || null, sort_order: idx }))
      );
    }

    logAudit(user?.id ?? null, "template.create", "checklist_templates", tmpl.id, { title: form.title, scope: createScope });
    // Save initial version snapshot
    await saveVersionSnapshot(
      tmpl.id,
      1,
      {
        title: form.title, description: form.description, category: form.category,
        priority: form.priority, status: form.status,
        template_type: form.template_type, template_mode: form.template_mode,
        is_critical: form.is_critical,
        recurrence_rule: form.recurrence_rule, recurrence_days: form.recurrence_days,
        recurrence_interval: form.recurrence_interval,
        recurrence_start: form.recurrence_start, recurrence_end: form.recurrence_end,
        due_date_offset: form.due_date_offset, due_date_time: form.due_date_time,
        sap_article_id: form.sap_article_id, time_slots: form.time_slots,
        is_delivery_task: form.is_delivery_task,
        delivery_flow_name: form.delivery_flow_name,
        delivery_supplier_name: form.delivery_supplier_name,
        delivery_entry_keys: form.delivery_entry_keys,
        event_trigger_description: form.event_trigger_description,
        event_trigger_user_id: form.event_trigger_user_id,
        depends_on_template_title: form.depends_on_template_title,
        review_interval_months: form.review_interval_months,
        items: validItems, questions: validQuestions,
      },
      form.changeSummary || "Initial version",
    );
    await load();
    setSaving(false);
    setShowCreate(false);
  }

  async function deleteTemplate() {
    if (!deleteTarget) return;
    await supabase.from("checklist_templates").delete().eq("id", deleteTarget.id);
    logAudit(user?.id ?? null, "template.delete", "checklist_templates", deleteTarget.id, { title: deleteTarget.title });
    setDeleteTarget(null);
    await load();
  }

  async function bulkDeleteTemplates() {
    const ids = [...selectedTemplateIds];
    await supabase.from("checklist_templates").delete().in("id", ids);
    ids.forEach(id => logAudit(user?.id ?? null, "template.delete", "checklist_templates", id, { bulk: true }));
    setSelectedTemplateIds(new Set());
    setBulkDeleteTemplatesOpen(false);
    await load();
  }

  // Add minutes to a HH:MM time string, returns HH:MM (clamped to same day)
  function addMinutesToTime(time: string, minutes: number): string {
    const [h, m] = time.split(":").map(Number);
    if (isNaN(h) || isNaN(m)) return time;
    const total = Math.min(h * 60 + m + minutes, 23 * 60 + 59);
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }

  // Return the date string (YYYY-MM-DD) for the next occurrence of a Swedish weekday from today
  // If today IS that day, returns today.
  function nextWeekdayDate(dayName: string): string {
    const dayMap: Record<string, number> = {
      "Söndag": 0, "Måndag": 1, "Tisdag": 2, "Onsdag": 3,
      "Torsdag": 4, "Fredag": 5, "Lördag": 6,
    };
    const target = dayMap[dayName];
    const now = new Date();
    if (target === undefined) return now.toISOString().slice(0, 10);
    const todayDay = now.getDay();
    let diff = target - todayDay;
    if (diff < 0) diff += 7;
    const result = new Date(now);
    result.setDate(now.getDate() + diff);
    return result.toISOString().slice(0, 10);
  }

  // Calculate the next due date for a recurring template from today — never returns a past date
  function calcNextDueDate(tmpl: ChecklistTemplate): { iso: string; time: string } | null {
    const rule = tmpl.recurrence_rule;
    if (!rule) return null;
    const now = new Date();
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    let base = new Date(today);

    if (rule === "daily" || rule === "every_other_day") {
      base = new Date(today); // today is always valid for daily
    } else if (rule === "weekly" || rule === "biweekly") {
      const days = tmpl.recurrence_days ?? [];
      if (days.length > 0) {
        // 0=Mon…6=Sun (our convention) → JS getDay(): 0=Sun,1=Mon…6=Sat
        const todayJs = today.getDay();
        const todayConv = todayJs === 0 ? 6 : todayJs - 1; // convert to Mon=0
        let found = false;
        for (let i = 0; i <= 7; i++) {
          if (days.includes((todayConv + i) % 7)) {
            base = new Date(today);
            base.setDate(today.getDate() + i);
            found = true;
            break;
          }
        }
        if (!found) { base = new Date(today); base.setDate(today.getDate() + 1); }
      }
    } else if (rule === "monthly" || rule === "quarterly") {
      const tAny = tmpl as ChecklistTemplate & { recurrence_month_day?: number };
      const targetDay = tAny.recurrence_month_day ?? 1;
      base = new Date(today.getFullYear(), today.getMonth(), targetDay);
      // If target day already passed this month (strictly before today), move to next month
      if (base < today) base.setMonth(base.getMonth() + 1);
    } else if (rule === "yearly") {
      const tAny = tmpl as ChecklistTemplate & { recurrence_months?: number[]; recurrence_month_day?: number };
      const months = tAny.recurrence_months ?? [];
      const targetDay = tAny.recurrence_month_day ?? 1;
      if (months.length > 0) {
        const curMonth = today.getMonth() + 1; // 1-based
        const curDay = today.getDate();
        // Find next month >= current where targetDay hasn't passed
        const nextMonth = months.find(m => m > curMonth || (m === curMonth && targetDay >= curDay));
        if (nextMonth != null) {
          base = new Date(today.getFullYear(), nextMonth - 1, targetDay);
        } else {
          base = new Date(today.getFullYear() + 1, months[0] - 1, targetDay);
        }
      }
    }

    // Ensure base is never in the past
    if (base < today) base = new Date(today);

    const timeStr = (tmpl as ChecklistTemplate & { due_date_time?: string }).due_date_time ?? "";
    if (timeStr) {
      const [h, m] = timeStr.split(":").map(Number);
      base.setHours(isNaN(h) ? 8 : h, isNaN(m) ? 0 : m, 0, 0);
    }
    return { iso: base.toISOString().slice(0, 10), time: timeStr };
  }

  function openBulkCreate() {
    const configs = [...selectedTemplateIds].map((id) => {
      const tmpl = templates.find(t => t.id === id);
      if (!tmpl) return null;
      const tmplAny = tmpl as ChecklistTemplate & { event_trigger_user_id?: string; delivery_flow_name?: string; delivery_supplier_name?: string };

      // Pre-select delivery entries matching the template's stored config
      // If delivery_entry_keys is set, use day+supplier+flow key matching (precise)
      // Otherwise fall back to supplier+flow matching (backwards compat)
      let preselectedDeliveryIds: string[] = [];
      if ((tmplAny as ChecklistTemplate & { is_delivery_task?: boolean }).is_delivery_task && deliveryWeekEntries.length > 0) {
        const tmplEntryKeys = ((tmplAny as ChecklistTemplate & { delivery_entry_keys?: string }).delivery_entry_keys ?? "")
          .split("|").map(s => s.trim()).filter(s => s.includes("||"));
        if (tmplEntryKeys.length > 0) {
          // Precise per-day matching using stored keys
          preselectedDeliveryIds = deliveryWeekEntries
            .filter(e => tmplEntryKeys.includes(`${e.delivery_day}||${e.supplier?.trim()}||${e.flow_name?.trim()}`))
            .map(e => e.id);
        } else {
          // Legacy: match by supplier+flow across all days
          const tmplFlows = (tmplAny.delivery_flow_name ?? "").split("|").map(s => s.trim().toLowerCase()).filter(Boolean);
          const tmplSuppliers = (tmplAny.delivery_supplier_name ?? "").split("|").map(s => s.trim().toLowerCase()).filter(Boolean);
          preselectedDeliveryIds = deliveryWeekEntries
            .filter(e => {
              const flowMatch = tmplFlows.length === 0 || tmplFlows.includes(e.flow_name?.toLowerCase() ?? "");
              const suppMatch = tmplSuppliers.length === 0 || tmplSuppliers.includes(e.supplier?.toLowerCase() ?? "");
              return flowMatch && suppMatch;
            })
            .map(e => e.id);
        }
      }

      return {
        templateId: id,
        assigneeUserIds: [] as string[],
        assigneeGroupIds: [] as string[],
        eventTriggerUserId: tmplAny.event_trigger_user_id ?? "",
        selectedDeliveryIds: preselectedDeliveryIds,
      };
    });
    setBulkTaskConfigs(configs.filter((c): c is BulkTaskConfig => c !== null));
    setBulkCreateOpen(true);
  }

  async function bulkCreateTasks() {
    setBulkCreating(true);
    const storeId = activeStore?.id ?? userStores[0]?.id ?? null;
    const skippedDueToDependency: string[] = [];

    // Pre-fetch existing tasks to resolve depends_on_template_title
    const { data: existingTasks } = await supabase
      .from("tasks")
      .select("id, title, status")
      .eq("store_id", storeId ?? "")
      .neq("status", "done")
      .limit(500);
    const existingTaskList = existingTasks ?? [];

    // Track tasks created in this batch: title (lowercase) → task id
    const createdInBatch = new Map<string, string>();

    // Sort configs: tasks with no dependency come first, then those whose dependency
    // is either already existing or created earlier in the same batch run
    const getDependsTitle = (cfg: BulkTaskConfig) => {
      const tmpl = templates.find(t => t.id === cfg.templateId);
      return ((tmpl as ChecklistTemplate & { depends_on_template_title?: string })?.depends_on_template_title ?? "").toLowerCase().trim();
    };
    const sortedConfigs = [...bulkTaskConfigs].sort((a, b) => {
      const aDep = getDependsTitle(a);
      const bDep = getDependsTitle(b);
      if (!aDep && bDep) return -1;
      if (aDep && !bDep) return 1;
      return 0;
    });

    for (const cfg of sortedConfigs) {
      const tmpl = templates.find(t => t.id === cfg.templateId);
      if (!tmpl) continue;

      const validItems = (tmpl.items ?? []).filter(it => it.label.trim());
      const validQuestions = (tmpl.questions ?? []).filter(q => q.label.trim());
      const assigneeRows = (taskId: string) => {
        const rows: { task_id: string; user_id?: string; group_id?: string }[] = [];
        cfg.assigneeUserIds.forEach(uid => rows.push({ task_id: taskId, user_id: uid }));
        cfg.assigneeGroupIds.forEach(gid => rows.push({ task_id: taskId, group_id: gid }));
        return rows;
      };
      const tmplAny = tmpl as ChecklistTemplate & {
        recurrence_months?: number[]; recurrence_month_day?: number;
        recurrence_start?: string; recurrence_end?: string;
        event_trigger_description?: string; is_critical?: boolean;
        template_mode?: string; time_slots?: string[];
      };

      // Leveransmallar: skapa en uppgift per vald leverans
      if ((tmpl as ChecklistTemplate & { is_delivery_task?: boolean }).is_delivery_task) {
        if (cfg.selectedDeliveryIds.length === 0) continue;
        for (const deliveryId of cfg.selectedDeliveryIds) {
          // Look up in deliveryWeekEntries first (has day+date), fall back to deliverySuppliers
          const delivery = deliveryWeekEntries.find(e => e.id === deliveryId) ?? deliverySuppliers.find(s => s.id === deliveryId) as (typeof deliveryWeekEntries[0]) | undefined;
          const rawTime = delivery?.delivery_time ?? "";
          // Due time = delivery time + 30 min (buffer for delays)
          const dueTime = rawTime ? addMinutesToTime(rawTime, 30) : "";
          // Calculate due date: use next occurrence of the delivery's weekday from today
          const deliveryDay = (delivery as { delivery_day?: string } | undefined)?.delivery_day ?? "";
          const dueDateStr = deliveryDay ? nextWeekdayDate(deliveryDay) : new Date().toISOString().slice(0, 10);
          const { data: task } = await supabase.from("tasks").insert({
            title: tmpl.title,
            description: tmpl.description ?? "",
            category: tmpl.category ?? "",
            priority: tmpl.priority ?? "Medel",
            store_id: storeId,
            due_date: (() => {
              const d = new Date(dueDateStr + "T00:00:00");
              if (dueTime) { const [h, m] = dueTime.split(":").map(Number); d.setHours(isNaN(h) ? 0 : h, isNaN(m) ? 0 : m, 0, 0); }
              return d.toISOString();
            })(),
            due_date_time: dueTime || null,
            delivery_entry_id: deliveryId,
            event_trigger_description: tmplAny.event_trigger_description ?? null,
            event_trigger_user_id: cfg.eventTriggerUserId || null,
            is_critical: tmplAny.is_critical ?? false,
            created_by: user?.id ?? null,
            assigned_to: cfg.assigneeUserIds[0] ?? user?.id ?? null,
            status: "todo",
          }).select("id").maybeSingle();
          if (!task?.id) continue;
          if (validQuestions.length > 0) {
            await supabase.from("task_questions").insert(
              validQuestions.map((q, i) => ({ task_id: task.id, label: q.label, question_type: q.question_type ?? "text", is_required: q.is_required, sort_order: i }))
            );
          }
          if (validItems.length > 0) {
            await supabase.from("task_steps").insert(
              validItems.map((it, i) => ({ task_id: task.id, label: it.label, sort_order: i, requires_photo: it.requires_photo, link_url: (it as ChecklistTemplateItem & { link_url?: string }).link_url || null }))
            );
          }
          const aRows = assigneeRows(task.id);
          if (aRows.length > 0) await supabase.from("task_assignees").insert(aRows);
          logAudit(user?.id ?? null, "task.create", "tasks", task.id, { title: tmpl.title, from_template: tmpl.id, delivery_entry_id: deliveryId });
          createdInBatch.set(tmpl.title.toLowerCase(), task.id);
        }
        continue;
      }

      // Manuell-only-mallar skapas inte i batch
      if (tmplAny.template_mode === "manual_only") continue;

      // Resolve dependency: check existing tasks first, then within-batch created tasks
      const dependsOnTitle = (tmpl as ChecklistTemplate & { depends_on_template_title?: string }).depends_on_template_title;
      let dependsOnTaskId: string | null = null;
      if (dependsOnTitle) {
        const key = dependsOnTitle.toLowerCase();
        dependsOnTaskId =
          createdInBatch.get(key) ??
          existingTaskList.find(t => (t.title ?? "").toLowerCase() === key)?.id ??
          null;
        // Dependency not satisfied — skip this template entirely
        if (!dependsOnTaskId) {
          skippedDueToDependency.push(tmpl.title);
          continue;
        }
      }

      const timeSlots: string[] = tmplAny.time_slots ?? [];
      const templatePriority = tmpl.priority ?? "Medel";
      const smartDate = calcNextDueDate(tmpl);

      const insertTask = async (dueTime: string) => {
        let dueIso: string | null = null;
        if (smartDate) {
          const d = new Date(smartDate.iso);
          if (dueTime) {
            const [h, m] = dueTime.split(":").map(Number);
            d.setHours(isNaN(h) ? 0 : h, isNaN(m) ? 0 : m, 0, 0);
          }
          dueIso = isNaN(d.getTime()) ? null : d.toISOString();
        } else if (tmpl.due_date_offset != null) {
          const d = new Date();
          d.setDate(d.getDate() + tmpl.due_date_offset);
          if (dueTime) {
            const [h, m] = dueTime.split(":").map(Number);
            d.setHours(isNaN(h) ? 0 : h, isNaN(m) ? 0 : m, 0, 0);
          }
          dueIso = d.toISOString();
        }

        const { data: task } = await supabase.from("tasks").insert({
          title: tmpl.title,
          description: tmpl.description ?? "",
          category: tmpl.category ?? "",
          priority: templatePriority,
          store_id: storeId,
          due_date: dueIso,
          due_date_time: dueTime || null,
          recurrence_rule: tmpl.recurrence_rule ?? null,
          recurrence_days: tmpl.recurrence_days ?? null,
          recurrence_interval: tmpl.recurrence_interval ?? null,
          recurrence_months: tmplAny.recurrence_months ?? null,
          recurrence_month_day: tmplAny.recurrence_month_day ?? null,
          recurrence_start: tmplAny.recurrence_start ?? null,
          recurrence_end: tmplAny.recurrence_end ?? null,
          event_trigger_description: tmplAny.event_trigger_description ?? null,
          event_trigger_user_id: cfg.eventTriggerUserId || null,
          depends_on_task_id: dependsOnTaskId,
          is_critical: tmplAny.is_critical ?? false,
          created_by: user?.id ?? null,
          assigned_to: cfg.assigneeUserIds[0] ?? user?.id ?? null,
          status: "todo",
        }).select("id, created_at").maybeSingle();

        if (!task?.id) return;

        // Register in batch map so later dependencies can resolve to this task
        createdInBatch.set(tmpl.title.toLowerCase(), task.id);

        let questionIdMap = new Map<string, string>();
        if (validQuestions.length > 0) {
          const { data: insertedQs } = await supabase.from("task_questions").insert(
            validQuestions.map((q, idx) => ({ task_id: task.id, label: q.label, question_type: q.question_type ?? "text", is_required: q.is_required, sort_order: idx }))
          ).select("id, sort_order");
          if (insertedQs) {
            insertedQs.forEach((iq: { id: string; sort_order: number }) => {
              const tmplQ = validQuestions[iq.sort_order];
              if (tmplQ?.id) questionIdMap.set(tmplQ.id, iq.id);
            });
          }
        }
        if (validItems.length > 0) {
          await supabase.from("task_steps").insert(
            validItems.map((it, idx) => ({
              task_id: task.id,
              label: it.label,
              sort_order: idx,
              requires_photo: it.requires_photo,
              link_url: (it as ChecklistTemplateItem & { link_url?: string }).link_url || null,
              condition_question_id: it.condition_question_id ? (questionIdMap.get(it.condition_question_id) ?? null) : null,
              condition_answer: it.condition_answer ?? null,
            }))
          );
        }
        const aRows = assigneeRows(task.id);
        if (aRows.length > 0) await supabase.from("task_assignees").insert(aRows);
        logAudit(user?.id ?? null, "task.create", "tasks", task.id, { title: tmpl.title, from_template: tmpl.id });

        // Spawna barninstanser direkt om mallen är återkommande
        if (tmpl.recurrence_rule) {
          await spawnChildrenForParent({
            id: task.id,
            title: tmpl.title,
            description: tmpl.description ?? "",
            category: tmpl.category ?? "",
            priority: templatePriority,
            store_id: storeId,
            due_date: dueIso,
            due_date_time: dueTime || null,
            recurrence_rule: tmpl.recurrence_rule,
            recurrence_days: tmpl.recurrence_days ?? null,
            recurrence_start: tmplAny.recurrence_start ?? null,
            recurrence_end: tmplAny.recurrence_end ?? null,
            created_by: user?.id ?? null,
            assigned_to: cfg.assigneeUserIds[0] ?? user?.id ?? null,
            created_at: task.created_at ?? new Date().toISOString(),
            steps: validItems.map((it, idx) => ({
              label: it.label, sort_order: idx, requires_photo: it.requires_photo,
              link_url: (it as ChecklistTemplateItem & { link_url?: string }).link_url || null,
              condition_question_id: it.condition_question_id ? (questionIdMap.get(it.condition_question_id) ?? null) : null,
              condition_answer: it.condition_answer ?? null,
            })),
            questions: validQuestions.map((q, idx) => ({
              id: [...questionIdMap.entries()].find(([tmplId]) => tmplId === q.id)?.[1] ?? "",
              label: q.label, question_type: q.question_type ?? "text",
              is_required: q.is_required, sort_order: idx,
            })),
            assignees: [
              ...cfg.assigneeUserIds.map(uid => ({ user_id: uid, group_id: null })),
              ...cfg.assigneeGroupIds.map(gid => ({ user_id: null, group_id: gid })),
            ],
          }, Date.now());
        }
      };

      // Time slots → one task per slot; otherwise one task using template's due_date_time
      if (timeSlots.length > 0) {
        for (const slot of timeSlots) {
          await insertTask(slot);
        }
      } else {
        await insertTask((tmpl as ChecklistTemplate & { due_date_time?: string }).due_date_time ?? "");
      }
    }

    setBulkCreating(false);
    setBulkCreateOpen(false);
    setSelectedTemplateIds(new Set());
    if (skippedDueToDependency.length > 0) {
      toast.warning(`${skippedDueToDependency.length} mall${skippedDueToDependency.length !== 1 ? "ar" : ""} hoppades över: ${skippedDueToDependency.join(", ")}. Beroende uppgift saknades — skapa beroendets mall i samma batch.`);
    }
  }

  function openEdit(t: TemplateWithMeta) {
    setEditTarget(t);
    setEditForm({
      title: t.title,
      description: t.description ?? "",
      category: t.category ?? "",
      priority: t.priority ?? "Medel",
      status: (t.status as FormState["status"]) ?? "active",
      recurrence_rule: t.recurrence_rule ?? "",
      recurrence_days: t.recurrence_days ?? [],
      recurrence_interval: (t as ChecklistTemplate & { recurrence_interval?: number }).recurrence_interval ?? 1,
      recurrence_months: (t as ChecklistTemplate & { recurrence_months?: number[] }).recurrence_months ?? [],
      recurrence_month_day: (t as ChecklistTemplate & { recurrence_month_day?: number }).recurrence_month_day ?? 1,
      recurrence_start: (t as ChecklistTemplate & { recurrence_start?: string }).recurrence_start ?? "",
      recurrence_end: (t as ChecklistTemplate & { recurrence_end?: string }).recurrence_end ?? "",
      due_date_offset: t.due_date_offset != null ? String(t.due_date_offset) : "",
      due_date_time: t.due_date_time ?? "",
      sap_article_id: (t as ChecklistTemplate & { sap_article_id?: string }).sap_article_id ?? "",
      time_slots: (t as ChecklistTemplate & { time_slots?: string[] }).time_slots ?? [],
      storeIds: t.storeIds,
      isGlobal: t.is_global ?? false,
      isLocked: t.locked_by_admin ?? false,
      foreningId: t.forening_id ?? "",
      changeSummary: "",
      template_type: ((t as ChecklistTemplate & { template_type?: string }).template_type ?? "regular") as "regular" | "base",
      template_mode: ((t as ChecklistTemplate & { template_mode?: string }).template_mode ?? "both") as "batch_only" | "manual_only" | "both",
      is_critical: (t as ChecklistTemplate & { is_critical?: boolean }).is_critical ?? false,
      review_interval_months: (t as ChecklistTemplate & { review_interval_months?: number }).review_interval_months ?? 24,
      event_trigger_description: (t as ChecklistTemplate & { event_trigger_description?: string }).event_trigger_description ?? "",
      event_trigger_user_id: (t as ChecklistTemplate & { event_trigger_user_id?: string }).event_trigger_user_id ?? "",
      is_delivery_task: (t as ChecklistTemplate & { is_delivery_task?: boolean }).is_delivery_task ?? false,
      delivery_flow_name: (t as ChecklistTemplate & { delivery_flow_name?: string }).delivery_flow_name ?? "",
      delivery_supplier_name: (t as ChecklistTemplate & { delivery_supplier_name?: string }).delivery_supplier_name ?? "",
      delivery_entry_keys: (t as ChecklistTemplate & { delivery_entry_keys?: string }).delivery_entry_keys ?? "",
      depends_on_template_title: (t as ChecklistTemplate & { depends_on_template_title?: string }).depends_on_template_title ?? "",
      items: (t.items ?? []).sort((a, b) => a.sort_order - b.sort_order).map((it) => ({ id: it.id, label: it.label, requires_photo: it.requires_photo, link_url: (it as ChecklistTemplateItem & { link_url?: string }).link_url ?? "", condition_question_id: (it as ChecklistTemplateItem & { condition_question_id?: string }).condition_question_id ?? undefined, condition_answer: (it as ChecklistTemplateItem & { condition_answer?: string }).condition_answer ?? undefined })),
      questions: (t.questions ?? []).sort((a, b) => a.sort_order - b.sort_order).map((q) => ({ id: q.id, label: q.label, question_type: q.question_type ?? "text", is_required: q.is_required, link_url: (q as ChecklistTemplateQuestion & { link_url?: string }).link_url ?? "" })),
    });
    setError("");
  }

  async function saveEdit() {
    if (!editTarget) return;
    setError("");
    if (!editForm.title.trim()) { setError("Titel är obligatorisk."); return; }
    const scope = editTarget.hierarchy_scope ?? "store";
    setSaving(true);

    await supabase.from("checklist_templates").update({
      title: editForm.title.trim(),
      description: editForm.description.trim(),
      category: editForm.category.trim(),
      priority: editForm.priority,
      status: editForm.status,
      version: (editTarget.version ?? 1) + 1,
      updated_by: user?.id ?? null,
      recurrence_rule: editForm.recurrence_rule || null,
      recurrence_days: (editForm.recurrence_rule === "weekly" || editForm.recurrence_rule === "biweekly") && editForm.recurrence_days.length > 0 ? editForm.recurrence_days : null,
      recurrence_interval: editForm.recurrence_interval > 1 ? editForm.recurrence_interval : null,
      recurrence_start: editForm.recurrence_start || null,
      recurrence_end: editForm.recurrence_end || null,
      due_date_offset: editForm.due_date_offset !== "" ? (parseInt(editForm.due_date_offset, 10) || null) : null,
      due_date_time: editForm.due_date_time || null,
      sap_article_id: editForm.sap_article_id?.trim() || null,
      time_slots: editForm.time_slots.length > 0 ? editForm.time_slots : null,
      is_global: editForm.isGlobal,
      locked_by_admin: editForm.isLocked,
      template_type: editForm.template_type,
      template_mode: editForm.template_mode,
      is_critical: editForm.is_critical,
      event_trigger_description: editForm.event_trigger_description?.trim() || null,
      event_trigger_user_id: editForm.event_trigger_user_id || null,
      is_delivery_task: editForm.is_delivery_task,
      delivery_flow_name: editForm.delivery_flow_name?.trim() || null,
      delivery_supplier_name: editForm.delivery_supplier_name?.trim() || null,
      delivery_entry_keys: editForm.delivery_entry_keys?.trim() || null,
      depends_on_template_title: editForm.depends_on_template_title?.trim() || null,
      review_interval_months: editForm.review_interval_months > 0 ? editForm.review_interval_months : null,
      // Ensure next_review_at is set if this becomes a recurring base template
      ...((editForm.template_type === "base" && editForm.recurrence_rule && !editForm.recurrence_end &&
          !(editTarget as ChecklistTemplate & { next_review_at?: string }).next_review_at)
        ? { next_review_at: (() => { const d = new Date(); d.setMonth(d.getMonth() + (editForm.review_interval_months || 24)); return d.toISOString(); })() }
        : {}),
    }).eq("id", editTarget.id);

    await supabase.from("checklist_template_items").delete().eq("template_id", editTarget.id);
    const validItems = editForm.items.filter((it) => it.label.trim());
    if (validItems.length > 0) {
      await supabase.from("checklist_template_items").insert(
        validItems.map((it, idx) => ({ template_id: editTarget.id, label: it.label.trim(), requires_photo: it.requires_photo, link_url: it.link_url || null, sort_order: idx, condition_question_id: it.condition_question_id ?? null, condition_answer: it.condition_answer ?? null }))
      );
    }

    await supabase.from("checklist_template_questions").delete().eq("template_id", editTarget.id);
    const validQuestions = editForm.questions.filter((q) => q.label.trim());
    if (validQuestions.length > 0) {
      await supabase.from("checklist_template_questions").insert(
        validQuestions.map((q, idx) => ({ template_id: editTarget.id, label: q.label.trim(), question_type: q.question_type, is_required: q.is_required, link_url: q.link_url || null, sort_order: idx }))
      );
    }

    await supabase.from("template_stores").delete().eq("template_id", editTarget.id);
    if (!editForm.isGlobal && scope === "store") {
      const storeList = editForm.storeIds.length > 0 ? editForm.storeIds : activeStore ? [activeStore.id] : editTarget.storeIds;
      if (storeList.length > 0) {
        await supabase.from("template_stores").insert(storeList.map((sid) => ({ template_id: editTarget.id, store_id: sid })));
      }
    }

    logAudit(user?.id ?? null, "template.edit", "checklist_templates", editTarget.id, { title: editForm.title });
    // Save version snapshot after edit
    const newVersion = (editTarget.version ?? 1) + 1;
    const validItemsEdit = editForm.items.filter(it => it.label.trim());
    const validQuestionsEdit = editForm.questions.filter(q => q.label.trim());
    await saveVersionSnapshot(
      editTarget.id,
      newVersion,
      {
        title: editForm.title, description: editForm.description, category: editForm.category,
        priority: editForm.priority, status: editForm.status,
        template_type: editForm.template_type, template_mode: editForm.template_mode,
        is_critical: editForm.is_critical,
        recurrence_rule: editForm.recurrence_rule, recurrence_days: editForm.recurrence_days,
        recurrence_interval: editForm.recurrence_interval,
        recurrence_start: editForm.recurrence_start, recurrence_end: editForm.recurrence_end,
        due_date_offset: editForm.due_date_offset, due_date_time: editForm.due_date_time,
        sap_article_id: editForm.sap_article_id, time_slots: editForm.time_slots,
        is_delivery_task: editForm.is_delivery_task,
        delivery_flow_name: editForm.delivery_flow_name,
        delivery_supplier_name: editForm.delivery_supplier_name,
        delivery_entry_keys: editForm.delivery_entry_keys,
        event_trigger_description: editForm.event_trigger_description,
        event_trigger_user_id: editForm.event_trigger_user_id,
        depends_on_template_title: editForm.depends_on_template_title,
        review_interval_months: editForm.review_interval_months,
        items: validItemsEdit, questions: validQuestionsEdit,
      },
      editForm.changeSummary || "Redigerat",
    );
    await load();
    setSaving(false);
    setEditTarget(null);
  }

  async function toggleHideHKTemplate(t: TemplateWithMeta) {
    if (!user?.forening_id) return;
    const alreadyHidden = hiddenEntries.some((h) => h.template_id === t.id && h.forening_id === user.forening_id);
    if (alreadyHidden) {
      await supabase.from("forening_hidden_templates")
        .delete()
        .eq("template_id", t.id)
        .eq("forening_id", user.forening_id);
    } else {
      await supabase.from("forening_hidden_templates").insert({
        template_id: t.id,
        forening_id: user.forening_id,
        hidden_by: user.id,
      });
    }
    await load();
  }

  function canEdit(t: TemplateWithMeta): boolean {
    if (isAdmin) return !t.is_system_locked;
    const scope = t.hierarchy_scope ?? "store";
    // Forening admins can edit their own forening templates
    if (scope === "forening") return isForening && t.created_by === user?.id;
    // HK templates can never be edited by non-admins — they get a local variant via the pencil button
    if (scope === "hk") return false;
    // Store scope: managers can edit non-locked templates (includes local variants of HK/forening)
    return isManager && !t.locked_by_admin;
  }

  function canDelete(t: TemplateWithMeta): boolean {
    if (isAdmin) return !t.is_system_locked;
    const scope = t.hierarchy_scope ?? "store";
    // Managers can only delete store-scope templates they have edit rights on
    if (scope === "hk" || scope === "forening") return false;
    return isManager && !t.locked_by_admin;
  }

  // When a manager tries to "edit" a HK/Forening template, we auto-create a local variant and open that
  async function createLocalVariantAndEdit(source: TemplateWithMeta) {
    const storeId = activeStore?.id ?? userStores[0]?.id ?? null;
    const { data: tmpl, error: insertErr } = await supabase.from("checklist_templates").insert({
      title: source.title,
      description: source.description ?? "",
      category: source.category ?? "",
      priority: source.priority ?? "Medel",
      status: "active",
      recurrence_rule: source.recurrence_rule ?? null,
      recurrence_days: source.recurrence_days ?? null,
      recurrence_interval: source.recurrence_interval ?? null,
      due_date_offset: source.due_date_offset ?? null,
      due_date_time: source.due_date_time ?? null,
      time_slots: (source as ChecklistTemplate & { time_slots?: string[] }).time_slots ?? null,
      created_by: user?.id ?? null,
      hierarchy_scope: "store",
      is_global: false,
      parent_template_id: source.id,
      inherit_mode: "variant",
      version: 1,
    }).select("id").maybeSingle();
    if (insertErr || !tmpl?.id) {
      setError(insertErr?.message ?? "Kunde inte skapa lokal variant. Kontrollera behörigheter.");
      return;
    }

    const validItems = (source.items ?? []).filter(it => it.label.trim());
    if (validItems.length > 0) {
      await supabase.from("checklist_template_items").insert(
        validItems.map((it, idx) => ({ template_id: tmpl.id, label: it.label, requires_photo: it.requires_photo, sort_order: idx }))
      );
    }
    const validQuestions = (source.questions ?? []).filter(q => q.label.trim());
    if (validQuestions.length > 0) {
      await supabase.from("checklist_template_questions").insert(
        validQuestions.map((q, idx) => ({ template_id: tmpl.id, label: q.label, question_type: q.question_type ?? "text", is_required: q.is_required, sort_order: idx }))
      );
    }
    if (storeId) {
      await supabase.from("template_stores").insert({ template_id: tmpl.id, store_id: storeId });
    }

    logAudit(user?.id ?? null, "template.variant.auto", "checklist_templates", tmpl.id, { source_id: source.id });

    // Fetch the newly created variant with all its relations and open it for editing
    const { data: fresh } = await supabase
      .from("checklist_templates")
      .select("*, items:checklist_template_items(*), questions:checklist_template_questions(*)")
      .eq("id", tmpl.id)
      .maybeSingle();
    await load();
    if (fresh) {
      const storeAssignments: { template_id: string; store_id: string }[] = storeId
        ? [{ template_id: tmpl.id, store_id: storeId }]
        : [];
      const withMeta = {
        ...(fresh as ChecklistTemplate),
        storeIds: storeAssignments.map(a => a.store_id),
        questions: (fresh as ChecklistTemplate & { questions?: ChecklistTemplateQuestion[] }).questions ?? [],
        items: (fresh as ChecklistTemplate & { items?: ChecklistTemplateItem[] }).items ?? [],
      } as TemplateWithMeta;
      openEdit(withMeta);
    }
  }

  // Merge changes from a parent HK/forening template into a local variant
  async function mergeFromParent(variant: TemplateWithMeta, parent: TemplateWithMeta) {
    setMerging(true);
    // Update variant metadata to match parent (title, description, category, priority, recurrence)
    await supabase.from("checklist_templates").update({
      title: parent.title,
      description: parent.description ?? "",
      category: parent.category ?? "",
      priority: parent.priority ?? "Medel",
      recurrence_rule: parent.recurrence_rule ?? null,
      recurrence_days: parent.recurrence_days ?? null,
      recurrence_interval: parent.recurrence_interval ?? null,
      due_date_offset: parent.due_date_offset ?? null,
      due_date_time: parent.due_date_time ?? null,
    }).eq("id", variant.id);

    // Replace checklist items with parent's items
    await supabase.from("checklist_template_items").delete().eq("template_id", variant.id);
    const validItems = (parent.items ?? []).filter((it) => it.label.trim());
    if (validItems.length > 0) {
      await supabase.from("checklist_template_items").insert(
        validItems.map((it, idx) => ({ template_id: variant.id, label: it.label, requires_photo: it.requires_photo, sort_order: idx }))
      );
    }

    // Replace questions with parent's questions
    await supabase.from("checklist_template_questions").delete().eq("template_id", variant.id);
    const validQuestions = (parent.questions ?? []).filter((q) => q.label.trim());
    if (validQuestions.length > 0) {
      await supabase.from("checklist_template_questions").insert(
        validQuestions.map((q, idx) => ({ template_id: variant.id, label: q.label, question_type: q.question_type ?? "text", is_required: q.is_required, sort_order: idx }))
      );
    }

    logAudit(user?.id ?? null, "template.variant.merge", "checklist_templates", variant.id, { parent_id: parent.id });
    setMerging(false);
    setMergeTarget(null);
    await load();
  }

  const displayStores = isAdmin ? allStores : userStores;

  // CSV: download blank import template with instructions
  const downloadBlankTemplate = () => {
    const headers = [
      "Titel", "Kategori", "Beskrivning", "Prioritet", "Status", "Version",
      "Återkommande", "Veckodagar", "Månader", "Månadsdag", "Intervall",
      "Förfaller om (dagar)", "Förfallotid (HH:MM)", "Startdatum", "Slutdatum",
      "Ursprungsmall", "Arvläge", "Steg (detaljer)", "Frågor", "Tidsluckor (HH:MM)",
      "SAP-artikel", "Mallpaket", "Händelsevillkor", "Leveransuppgift (ja/nej)", "Leveransflöde",
      "Kedja (beror på mallnamn)", "Malltyp", "Skapningsläge", "Händelse-bekräftare",
      "Granskningsintervall (månader)", "Kritisk (ja/nej)", "Leveransföretag",
    ];
    const today = new Date().toISOString().slice(0, 10);
    const exampleA = [
      "Daglig öppningskontroll", "Drift", "Genomförs varje morgon vid öppning", "Hög", "active", "",
      "weekly", "0,1,2,3,4", "", "", "1",
      "0", "07:00", today, "2026-12-31",
      "", "",
      "1. Lås upp entré | 2. Kontrollera temperatur kyl [foto] | 3. Rapportera avvikelse [om:Temperaturavvikelse?=ja]",
      "1. Temperaturavvikelse? [obligatorisk] [ja_nej] | 2. Notering",
      "",
      "",
      "", // Händelsevillkor
      "", // Leveransuppgift
      "", // Leveransflöde
      "", // Kedja
      "", // Malltyp
      "both", // Skapningsläge
      "", // Händelse-bekräftare
      "", // Granskningsintervall
      "", // Kritisk
      "", // Leveransföretag
    ];
    const exampleB = [
      "Varumottagning Färskt", "Drift", "Tas emot vid leverans", "Medel", "active", "",
      "", "", "", "", "",
      "0", "", today, "",
      "", "",
      "1. Kontrollera följesedel | 2. Kontrollera temperatur [foto] | 3. Signera kvitto",
      "",
      "",
      "",
      "", // Händelsevillkor
      "ja", // Leveransuppgift — sätts till is_delivery_task=true
      "Färskt", // Leveransflöde — filtrar på detta flöde i leveransplanen
      "", // Kedja
      "grundmall", // Malltyp
      "batch_only", // Skapningsläge
      "", // Händelse-bekräftare
      "24", // Granskningsintervall
      "", // Kritisk
      "Eskilstuna Coop logistik AB", // Leveransföretag — kopplar till specifikt företag
    ];
    const csv = CSV_TEMPLATE_INSTRUCTIONS
      + [headers, exampleA, exampleB].map((r) => r.map((v) => `"${sanitizeCsvCell(String(v).replace(/"/g, '""'))}"`).join(";")).join("\n");
    triggerDownload(csv, "mall-import-template.csv");
  };

  const exportCSV = () => {
    // Export in identical format to import template so exported files can be re-imported directly
    const headers = [
      "Titel", "Kategori", "Beskrivning", "Prioritet", "Status", "Version",
      "Återkommande", "Veckodagar", "Månader", "Månadsdag", "Intervall",
      "Förfaller om (dagar)", "Förfallotid (HH:MM)", "Startdatum", "Slutdatum",
      "Ursprungsmall", "Arvläge", "Steg (detaljer)", "Frågor", "Tidsluckor (HH:MM)",
      "SAP-artikel", "Mallpaket", "Händelsevillkor", "Leveransuppgift (ja/nej)", "Leveransflöde", "Kedja (beror på mallnamn)",
      "Malltyp", "Skapningsläge", "Händelse-bekräftare", "Granskningsintervall (månader)", "Kritisk (ja/nej)", "Leveransföretag",
    ];
    const rows = [
      headers,
      ...templates.map((t) => {
        const sortedQuestions = (t.questions ?? []).sort((a, b) => a.sort_order - b.sort_order);
        const stepsStr = (t.items ?? []).sort((a, b) => a.sort_order - b.sort_order).map((it, idx) => {
          let s = `${idx + 1}. ${it.label}`;
          if (it.requires_photo) s += " [foto]";
          if ((it as ChecklistTemplateItem & { link_url?: string }).link_url) s += ` [url:${(it as ChecklistTemplateItem & { link_url?: string }).link_url}]`;
          if (it.condition_question_id) {
            const condQ = sortedQuestions.find(q => q.id === it.condition_question_id);
            if (condQ) s += ` [om:${condQ.label}=${it.condition_answer ?? "ja"}]`;
          }
          return s;
        }).join(" | ");
        const questionsStr = sortedQuestions.map((q, idx) =>
          `${idx + 1}. ${q.label}${q.is_required ? " [obligatorisk]" : ""}${q.question_type === "yes_no" ? " [ja_nej]" : ""}${(q as ChecklistTemplateQuestion & { link_url?: string }).link_url ? ` [url:${(q as ChecklistTemplateQuestion & { link_url?: string }).link_url}]` : ""}`
        ).join(" | ");
        const tAny = t as ChecklistTemplate & {
          recurrence_start?: string; recurrence_end?: string;
          recurrence_months?: number[]; recurrence_month_day?: number;
          time_slots?: string[]; sap_article_id?: string;
        };
        return [
          t.title,
          t.category ?? "",
          t.description ?? "",
          t.priority ?? "Medel",
          t.status ?? "active",
          String(t.version ?? 1),
          t.recurrence_rule ?? "",
          (t.recurrence_days ?? []).join(","),
          (tAny.recurrence_months ?? []).join(","),
          tAny.recurrence_month_day != null ? String(tAny.recurrence_month_day) : "",
          t.recurrence_interval != null ? String(t.recurrence_interval) : "",
          t.due_date_offset != null ? String(t.due_date_offset) : "",
          t.due_date_time ?? "",
          tAny.recurrence_start ?? "",
          tAny.recurrence_end ?? "",
          t.parent_template_id ?? "",
          t.inherit_mode ?? "",
          stepsStr,
          questionsStr,
          tAny.time_slots?.join(" | ") ?? "",
          tAny.sap_article_id ?? "",
          packages.filter(pkg => (pkg.items ?? []).some(item => item.template_id === t.id)).map(pkg => pkg.name).join(" | "),
          (t as ChecklistTemplate & { event_trigger_description?: string }).event_trigger_description ?? "",
          (t as ChecklistTemplate & { is_delivery_task?: boolean }).is_delivery_task ? "ja" : "",
          (t as ChecklistTemplate & { delivery_flow_name?: string }).delivery_flow_name ?? "",
          (t as ChecklistTemplate & { depends_on_template_title?: string }).depends_on_template_title ?? "",
          ((t as ChecklistTemplate & { template_type?: string }).template_type === "base") ? "grundmall" : "regular",
          (t as ChecklistTemplate & { template_mode?: string }).template_mode ?? "both",
          (t as ChecklistTemplate & { event_trigger_user_id?: string }).event_trigger_user_id ?? "",
          (t as ChecklistTemplate & { review_interval_months?: number }).review_interval_months != null
            ? String((t as ChecklistTemplate & { review_interval_months?: number }).review_interval_months)
            : "",
          (t as ChecklistTemplate & { is_critical?: boolean }).is_critical ? "ja" : "",
          (t as ChecklistTemplate & { delivery_supplier_name?: string }).delivery_supplier_name ?? "",
        ];
      }),
    ];
    const instructions = `# Exporterat från StoreFlow ${new Date().toLocaleDateString("sv-SE")} — kan importeras direkt\n` + CSV_TEMPLATE_INSTRUCTIONS;
    const csv = instructions + rows.map((r) => r.map((v) => `"${sanitizeCsvCell(String(v ?? "").replace(/"/g, '""'))}"`).join(";")).join("\n");
    triggerDownload("\ufeff" + csv, `mallar-${activeStore?.name ?? "export"}-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  function triggerDownload(content: string, filename: string) {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  function parseRow(line: string): string[] {
    const cols: string[] = [];
    let cur = ""; let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === ";" && !inQuote) { cols.push(cur); cur = ""; }
      else { cur += ch; }
    }
    cols.push(cur);
    return cols;
  }

  const importCSV = async (result: ImportDialogResult) => {
    setImporting(true);
    setShowImportDialog(false);
    const text = await result.file.text();
    const cleaned = text.startsWith("\ufeff") ? text.slice(1) : text;
    const lines = cleaned.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("#"));
    if (lines.length < 2) { setImporting(false); return; }

    const importScope = isAdmin
      ? String(result.options.scope ?? "store")
      : isForening
        ? String(result.options.scope ?? "forening")
        : "store";

    // Resolve forening_id for forening-scope imports: prefer dialog selection,
    // then user's own forening_id, then look up from user_foreningar.
    let resolvedForeningId: string | null = null;
    if (importScope === "forening") {
      const selectedForeningId = result.options.foreningId && result.options.foreningId !== "__none"
        ? String(result.options.foreningId) : null;
      if (selectedForeningId) {
        resolvedForeningId = selectedForeningId;
      } else {
        resolvedForeningId = user?.forening_id ?? null;
      }
      if (!resolvedForeningId) {
        const { data: uf } = await supabase
          .from("user_foreningar")
          .select("forening_id")
          .eq("user_id", user?.id ?? "")
          .eq("is_primary", true)
          .maybeSingle();
        resolvedForeningId = uf?.forening_id ?? null;
        if (!resolvedForeningId) {
          const { data: anyUf } = await supabase
            .from("user_foreningar")
            .select("forening_id")
            .eq("user_id", user?.id ?? "")
            .limit(1)
            .maybeSingle();
          resolvedForeningId = anyUf?.forening_id ?? null;
        }
      }
    }

    const rows = lines.slice(1).map(parseRow);
    // Track delivery templates for post-import supplier mapping
    const importedDeliveryTemplates: { id: string; title: string }[] = [];
    // Local cache keyed by lowercase name so multiple rows with the same package
    // name reuse the same package record instead of creating duplicates.
    const pkgCache = new Map<string, TemplatePackage>(
      packages.map(p => [p.name.toLowerCase(), p])
    );
    for (let cols of rows) {
      // Backwards-compat: old 30-col format lacked SAP-artikel at col 20.
      // Insert empty string there so all subsequent columns align correctly.
      if (cols.length === 30) {
        cols = [...cols.slice(0, 20), "", ...cols.slice(20)];
      }
      // Column order (0-indexed):
      // 0:Titel 1:Kategori 2:Beskrivning 3:Prioritet 4:Status 5:Version
      // 6:Återkommande 7:Veckodagar 8:Månader 9:Månadsdag 10:Intervall
      // 11:Förfaller om 12:Förfallotid 13:Startdatum 14:Slutdatum
      // 15:Ursprungsmall 16:Arvläge 17:Steg 18:Frågor 19:Tidsluckor 20:SAP-artikel
      // 21:Mallpaket 22:Händelsevillkor 23:Leveransuppgift 24:Leveransflöde 25:Kedja
      // 26:Malltyp 27:Skapningsläge 28:Händelse-bekräftare 29:Granskningsintervall 30:Kritisk 31:Leveransföretag
      const [
        title, category, description, priority, statusRaw, ,
        recurrence, weekdaysRaw, monthsRaw, monthDayRaw, intervalRaw,
        dueDays, dueTime, startDate, endDate,
        parentTemplateId, inheritModeRaw, stepsRaw, questionsRaw, timeSlotsRaw,
        sapArticleIdRaw, packageNameRaw, eventTriggerRaw, deliveryTaskRaw, deliveryFlowRaw, chainTitleRaw,
        templateTypeRaw, templateModeRaw, eventTriggerUserIdRaw, reviewIntervalRaw, isCriticalRaw,
        deliverySupplierRaw,
      ] = cols;
      if (!title?.trim()) continue;

      const recurrenceRule = (recurrence ?? "").trim() || null;
      const recurrenceDays = weekdaysRaw?.trim()
        ? weekdaysRaw.split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n >= 0 && n <= 6)
        : null;
      const recurrenceMonths = monthsRaw?.trim()
        ? monthsRaw.split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n >= 1 && n <= 12)
        : null;
      const recurrenceMonthDay = monthDayRaw?.trim() ? (parseInt(monthDayRaw.trim()) || null) : null;
      const recurrenceInterval = intervalRaw?.trim() ? (parseInt(intervalRaw.trim()) || null) : null;
      const templateStatus = (["active", "review", "deprecated", "archived"].includes((statusRaw ?? "").trim()))
        ? (statusRaw!.trim() as "active" | "review" | "deprecated" | "archived")
        : "active";
      const inferredInheritMode = (inheritModeRaw?.trim() === "variant" || inheritModeRaw?.trim() === "copy")
        ? inheritModeRaw.trim() as "copy" | "variant"
        : null;

      const isDeliveryTask = (deliveryTaskRaw?.trim().toLowerCase() === "ja") || false;
      // Leveransmallar och mallar med explicit "grundmall" i CSV sätts till "base"
      const csvTemplateType = templateTypeRaw?.trim().toLowerCase();
      const inferredTemplateType: "regular" | "base" =
        isDeliveryTask || csvTemplateType === "grundmall" || csvTemplateType === "base"
          ? "base"
          : "regular";
      const csvTemplateMode = templateModeRaw?.trim().toLowerCase();
      const inferredTemplateMode: "batch_only" | "manual_only" | "both" =
        csvTemplateMode === "batch_only" ? "batch_only"
        : csvTemplateMode === "manual_only" ? "manual_only"
        : "both";
      const reviewIntervalMonths = reviewIntervalRaw?.trim() ? (parseInt(reviewIntervalRaw.trim()) || null) : null;

      const { data: tmpl } = await supabase.from("checklist_templates").insert({
        title: title.trim(),
        category: (category ?? "").trim(),
        description: (description ?? "").trim(),
        priority: (priority ?? "Medel").trim() || "Medel",
        status: templateStatus,
        version: 1,
        template_type: inferredTemplateType,
        template_mode: inferredTemplateMode,
        recurrence_rule: recurrenceRule,
        recurrence_days: recurrenceDays && recurrenceDays.length > 0 ? recurrenceDays : null,
        recurrence_months: recurrenceMonths && recurrenceMonths.length > 0 ? recurrenceMonths : null,
        recurrence_month_day: recurrenceMonthDay && !isNaN(recurrenceMonthDay) ? recurrenceMonthDay : null,
        recurrence_interval: recurrenceInterval && recurrenceInterval > 1 ? recurrenceInterval : null,
        recurrence_start: startDate?.trim() || null,
        recurrence_end: endDate?.trim() || null,
        due_date_offset: dueDays?.trim() ? (parseInt(dueDays.trim(), 10) || null) : null,
        due_date_time: dueTime?.trim() || null,
        parent_template_id: parentTemplateId?.trim() || null,
        inherit_mode: inferredInheritMode,
        created_by: user?.id ?? null,
        hierarchy_scope: importScope,
        is_global: importScope === "hk",
        time_slots: timeSlotsRaw?.trim()
          ? timeSlotsRaw.split("|").map(s => s.trim()).filter(Boolean)
          : null,
        sap_article_id: sapArticleIdRaw?.trim() || null,
        forening_id: importScope === "forening" ? resolvedForeningId : null,
        event_trigger_description: eventTriggerRaw?.trim() || null,
        event_trigger_user_id: eventTriggerUserIdRaw?.trim() || null,
        is_delivery_task: isDeliveryTask,
        delivery_flow_name: deliveryFlowRaw?.trim() || null,
        delivery_supplier_name: deliverySupplierRaw?.trim() || null,
        depends_on_template_title: chainTitleRaw?.trim() || null,
        review_interval_months: reviewIntervalMonths,
        is_critical: isCriticalRaw?.trim().toLowerCase() === "ja",
      }).select("id").maybeSingle();

      if (!tmpl?.id) continue;

      // Track delivery templates so we can prompt for supplier mapping after import
      if (isDeliveryTask) {
        importedDeliveryTemplates.push({ id: tmpl.id, title: title.trim() });
      }

      if (stepsRaw?.trim()) {
        const items = stepsRaw.split("|").map((s) => s.trim()).filter(Boolean).map((part, idx) => {
          const condMatch = part.match(/\[om:([^\]=]+)=([^\]]+)\]/i);
          const urlMatch = part.match(/\[url:([^\]]+)\]/i);
          const cleanLabel = part
            .replace(/^\d+\.\s*/, "")
            .replace(/\s*\[foto\]/i, "")
            .replace(/\s*\[url:[^\]]+\]/i, "")
            .replace(/\s*\[om:[^\]]+\]/i, "")
            .trim();
          return {
            template_id: tmpl.id,
            label: cleanLabel,
            requires_photo: /\[foto\]/i.test(part),
            link_url: urlMatch ? urlMatch[1].trim() : null,
            condition_question_label: condMatch ? condMatch[1].trim() : null,
            condition_answer: condMatch ? condMatch[2].trim() : null,
            sort_order: idx,
          };
        });
        if (items.length > 0) {
          // Insert items first without condition_question_id (resolve after questions are inserted)
          const insertedItems = await supabase.from("checklist_template_items").insert(
            items.map(({ condition_question_label: _cql, ...rest }) => rest)
          ).select("id, sort_order");
          // condition_question_id resolution done after questions insert below
          if (insertedItems.data) {
            (tmpl as typeof tmpl & { _pendingConditions?: { itemSortOrder: number; questionLabel: string; answer: string }[] })._pendingConditions =
              items
                .filter(it => it.condition_question_label)
                .map(it => ({ itemSortOrder: it.sort_order, questionLabel: it.condition_question_label!, answer: it.condition_answer! }));
          }
        }
      }

      if (questionsRaw?.trim()) {
        const questions = questionsRaw.split("|").map((s) => s.trim()).filter(Boolean).map((part, idx) => {
          const urlMatch = part.match(/\[url:([^\]]+)\]/i);
          return {
            template_id: tmpl.id,
            label: part.replace(/^\d+\.\s*/, "").replace(/\s*\[obligatorisk\]/i, "").replace(/\s*\[ja_nej\]/i, "").replace(/\s*\[url:[^\]]+\]/i, "").trim(),
            question_type: /\[ja_nej\]/i.test(part) ? "yes_no" : "text",
            is_required: /\[obligatorisk\]/i.test(part),
            link_url: urlMatch ? urlMatch[1].trim() : null,
            sort_order: idx,
          };
        });
        if (questions.length > 0) {
          const { data: insertedQs } = await supabase.from("checklist_template_questions").insert(questions).select("id, label, sort_order");
          // Resolve condition_question_id for items that have pending conditions
          const pending = (tmpl as typeof tmpl & { _pendingConditions?: { itemSortOrder: number; questionLabel: string; answer: string }[] })._pendingConditions;
          if (pending?.length && insertedQs?.length) {
            for (const cond of pending) {
              const matchedQ = insertedQs.find(q => (q.label ?? "").toLowerCase() === cond.questionLabel.toLowerCase());
              if (!matchedQ) continue;
              await supabase.from("checklist_template_items")
                .update({ condition_question_id: matchedQ.id, condition_answer: cond.answer })
                .eq("template_id", tmpl.id)
                .eq("sort_order", cond.itemSortOrder);
            }
          }
        }
      }

      // Assign to active store for store-scope templates
      if (importScope === "store" && activeStore) {
        await supabase.from("template_stores").insert({ template_id: tmpl.id, store_id: activeStore.id });
      }

      // Assign to package if specified
      if (packageNameRaw?.trim() && tmpl?.id) {
        const pkgName = packageNameRaw.trim();
        const pkgKey = pkgName.toLowerCase();
        const storeId = activeStore?.id ?? userStores[0]?.id ?? null;
        let pkg = pkgCache.get(pkgKey);
        if (!pkg) {
          const { data: newPkg } = await supabase.from("template_packages")
            .insert({ name: pkgName, description: "", store_id: storeId, created_by: user?.id ?? null })
            .select("id, name, description, store_id, created_by, created_at")
            .maybeSingle();
          if (newPkg) {
            pkg = { ...newPkg, items: [] } as TemplatePackage;
            pkgCache.set(pkgKey, pkg);
          }
        }
        if (pkg?.id) {
          const nextOrder = (pkg.items ?? []).length;
          await supabase.from("template_package_items").insert({
            package_id: pkg.id,
            template_id: tmpl.id,
            sort_order: nextOrder,
          });
          // Keep items count in sync so subsequent rows get correct sort_order
          pkg.items = [...(pkg.items ?? []), { template_id: tmpl.id } as TemplatePackageItem];
        }
      }

      logAudit(user?.id ?? null, "template.import", "checklist_templates", tmpl.id, { title: title.trim(), scope: importScope });
    }

    await load();
    setImporting(false);

    // If any imported templates are delivery tasks, show supplier mapping dialog
    if (importedDeliveryTemplates.length > 0) {
      const storeId = activeStore?.id ?? userStores[0]?.id ?? null;
      if (storeId && deliveryWeekEntries.length > 0) {
        setDeliveryMappingItems(importedDeliveryTemplates.map(t => ({ templateId: t.id, templateTitle: t.title, entryKeys: [] })));
        setDeliveryMappingOpen(true);
      } else if (storeId) {
        // Fallback: fetch entries if deliveryWeekEntries not loaded yet
        const { data: entries } = await supabase
          .from("delivery_entries")
          .select("id, supplier, flow_name, delivery_time, delivery_day")
          .eq("plan_id",
            (await supabase.from("delivery_plans").select("id").eq("store_id", storeId).order("imported_at", { ascending: false }).limit(1).maybeSingle()).data?.id ?? ""
          )
          .order("delivery_day").order("delivery_time");
        if (entries && entries.length > 0) {
          setDeliveryWeekEntries(prev => prev.length > 0 ? prev : (entries as typeof deliveryWeekEntries));
          setDeliveryMappingItems(importedDeliveryTemplates.map(t => ({ templateId: t.id, templateTitle: t.title, entryKeys: [] })));
          setDeliveryMappingOpen(true);
        }
      }
    }
  };

  const saveDeliveryMapping = async () => {
    setDeliveryMappingSaving(true);
    for (const item of deliveryMappingItems) {
      if (!item.entryKeys.length) continue;
      const matched = deliveryWeekEntries.filter(e =>
        item.entryKeys.includes(`${e.delivery_day}||${e.supplier?.trim()}||${e.flow_name?.trim()}`)
      );
      const supplierNames = [...new Set(matched.map(e => e.supplier?.trim() ?? "").filter(Boolean))];
      const flowNames = [...new Set(matched.map(e => e.flow_name?.trim() ?? "").filter(Boolean))];
      await supabase.from("checklist_templates")
        .update({
          delivery_supplier_name: supplierNames.join("|") || null,
          delivery_flow_name: flowNames.join("|") || null,
          delivery_entry_keys: item.entryKeys.join("|") || null,
        })
        .eq("id", item.templateId);
    }
    setDeliveryMappingOpen(false);
    setDeliveryMappingItems([]);
    setDeliveryMappingSaving(false);
    await load();
  };

  // Unique categories from loaded templates
  const allCategories = useMemo(() =>
    [...new Set(templates.map((t) => t.category).filter(Boolean) as string[])].sort(),
    [templates]
  );

  // Apply search + category + priority filters
  const filteredTemplates = useMemo(() => {
    const q = search.toLowerCase();
    return templates.filter((t) => {
      if (filterCategory && t.category !== filterCategory) return false;
      if (filterPriority && t.priority !== filterPriority) return false;
      if (q && !(t.title ?? "").toLowerCase().includes(q) && !(t.category ?? "").toLowerCase().includes(q) && !(t.description ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [templates, search, filterCategory, filterPriority]);

  // Templates grouped for display
  // Local variants (inherit_mode='variant', parent_template_id set) are nested under their parent — exclude from store group
  const variantTemplateIds = useMemo(
    () => new Set(filteredTemplates.filter((t) => t.inherit_mode === "variant" && t.parent_template_id).map((t) => t.id)),
    [filteredTemplates]
  );
  // Map from parent id → local variants owned by the current store
  const variantsByParent = useMemo(() => {
    const map = new Map<string, TemplateWithMeta[]>();
    for (const t of filteredTemplates) {
      if (t.inherit_mode === "variant" && t.parent_template_id) {
        const arr = map.get(t.parent_template_id) ?? [];
        arr.push(t);
        map.set(t.parent_template_id, arr);
      }
    }
    return map;
  }, [filteredTemplates]);

  const hkTemplates = filteredTemplates.filter((t) => t.hierarchy_scope === "hk" || (t.is_global && !t.hierarchy_scope));
  const foreningTemplates = filteredTemplates.filter((t) => t.hierarchy_scope === "forening");
  // Exclude variants that have a visible parent — they'll be nested under the parent
  const parentIdsInView = useMemo(() => {
    const ids = new Set<string>();
    for (const t of filteredTemplates) {
      if (t.hierarchy_scope === "hk" || t.is_global || t.hierarchy_scope === "forening") ids.add(t.id);
    }
    return ids;
  }, [filteredTemplates]);
  const storeTemplates = filteredTemplates.filter((t) => {
    if (t.hierarchy_scope && t.hierarchy_scope !== "store") return false;
    // Hide variants whose parent is visible in hk/forening groups (they render inline)
    if (t.inherit_mode === "variant" && t.parent_template_id && parentIdsInView.has(t.parent_template_id)) return false;
    return true;
  });

  const visibleGroups: { label: string; badge: string; badgeClass: string; items: TemplateWithMeta[] }[] = [];
  if (viewFilter === "all" || viewFilter === "hk") {
    if (hkTemplates.length > 0 || viewFilter === "hk") {
      visibleGroups.push({ label: "HK-mallar", badge: "HK", badgeClass: "border-blue-300 text-blue-600", items: hkTemplates });
    }
  }
  if (viewFilter === "all" || viewFilter === "forening") {
    if (foreningTemplates.length > 0 || viewFilter === "forening") {
      visibleGroups.push({ label: "Föreningsmallar", badge: "Förening", badgeClass: "border-teal-300 text-teal-600", items: foreningTemplates });
    }
  }
  if (viewFilter === "all" || viewFilter === "store") {
    if (storeTemplates.length > 0 || viewFilter === "store") {
      visibleGroups.push({ label: "Butiksmallar", badge: "Butik", badgeClass: "border-border text-muted-foreground", items: storeTemplates });
    }
  }

  const getTemplateBadge = (t: TemplateWithMeta) => {
    const scope = t.hierarchy_scope ?? "store";
    if (scope === "hk" || t.is_global) return { label: "HK-mall", cls: "border-blue-300 text-blue-600" };
    if (scope === "forening") {
      const f = allForeningar.find((x) => x.id === t.forening_id);
      return { label: `${f?.name ?? "Förening"}-mall`, cls: "border-teal-300 text-teal-600" };
    }
    return null;
  };

  const getStatusBadge = (t: TemplateWithMeta) => {
    const opt = TEMPLATE_STATUS_OPTIONS.find(o => o.value === (t.status ?? "active"));
    return opt ?? TEMPLATE_STATUS_OPTIONS[0];
  };

  const isHiddenForMyForening = (t: TemplateWithMeta) =>
    !!(user?.forening_id && hiddenEntries.some((h) => h.template_id === t.id && h.forening_id === user.forening_id));

  // Shared form panels rendered for both create and edit dialogs
  function renderFormContent(
    f: FormState,
    setF: React.Dispatch<React.SetStateAction<FormState>>,
    scope: "store" | "hk" | "forening"
  ) {
    return (
      <div className="flex overflow-hidden" style={{ maxHeight: "calc(92dvh - 56px)" }}>
        {/* LEFT */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 pb-10 min-w-0">
          <input
            placeholder="Mallens namn..."
            value={f.title}
            onChange={(e) => setF((p) => ({ ...p, title: e.target.value }))}
            className="w-full border-0 bg-transparent text-xl font-bold text-foreground placeholder:text-muted-foreground/50 outline-none focus:outline-none"
          />
          <Textarea
            placeholder="Kort beskrivning av vad mallen används till..."
            value={f.description}
            onChange={(e) => setF((p) => ({ ...p, description: e.target.value }))}
            rows={2}
            className="resize-none border-0 bg-transparent px-0 text-sm text-muted-foreground placeholder:text-muted-foreground/40 focus-visible:ring-0 shadow-none"
          />

          {/* Steg */}
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Steg</p>
            <div className="space-y-1.5">
              {f.items.map((item, idx) => {
                const yesNoQuestions = f.questions.filter(q => q.question_type === "yes_no" && q.label.trim());
                return (
                  <div key={idx} className="rounded-lg border border-border/50 bg-muted/20 transition-colors hover:bg-muted/40">
                    <div className="group flex items-center gap-2 px-3 py-2">
                      <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/30" />
                      <Input
                        placeholder={`Steg ${idx + 1}`}
                        value={item.label}
                        onChange={(e) => {
                          const items = [...f.items]; items[idx] = { ...items[idx], label: e.target.value };
                          setF((p) => ({ ...p, items }));
                        }}
                        className="flex-1 border-0 bg-transparent p-0 h-auto text-sm shadow-none focus-visible:ring-0"
                      />
                      <label className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground/70 cursor-pointer">
                        <Checkbox
                          checked={item.requires_photo}
                          onCheckedChange={(v) => {
                            const items = [...f.items]; items[idx] = { ...items[idx], requires_photo: !!v };
                            setF((p) => ({ ...p, items }));
                          }}
                          className="h-3 w-3"
                        />
                        Foto
                      </label>
                      <Input
                        placeholder="URL"
                        value={item.link_url ?? ""}
                        onChange={(e) => {
                          const items = [...f.items]; items[idx] = { ...items[idx], link_url: e.target.value };
                          setF((p) => ({ ...p, items }));
                        }}
                        onBlur={(e) => {
                          const v = ensureHttps(e.target.value);
                          if (v !== (item.link_url ?? "")) { const items = [...f.items]; items[idx] = { ...items[idx], link_url: v }; setF((p) => ({ ...p, items })); }
                        }}
                        className="w-24 border-0 bg-transparent p-0 h-auto text-xs shadow-none focus-visible:ring-0 text-primary placeholder:text-muted-foreground/40"
                      />
                      {item.link_url && (
                        <a href={item.link_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="shrink-0 text-primary hover:text-primary/70">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                      <button
                        type="button"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => setF((p) => ({ ...p, items: p.items.filter((_, i) => i !== idx) }))}
                        disabled={f.items.length === 1}
                      >
                        <X className="h-3.5 w-3.5 text-muted-foreground/60" />
                      </button>
                    </div>
                    {/* Conditional logic — only shown if there are yes/no questions */}
                    {yesNoQuestions.length > 0 && (
                      <div className="flex items-center gap-2 border-t border-border/30 px-3 pb-2 pt-1.5">
                        <span className="text-[11px] text-muted-foreground/60">Visa om</span>
                        <Select
                          value={item.condition_question_id ?? "__none"}
                          onValueChange={(v) => {
                            const items = [...f.items];
                            items[idx] = { ...items[idx], condition_question_id: v === "__none" ? undefined : v, condition_answer: v === "__none" ? undefined : (items[idx].condition_answer ?? "ja") };
                            setF((p) => ({ ...p, items }));
                          }}
                        >
                          <SelectTrigger className="h-6 flex-1 border-0 bg-transparent p-0 text-[11px] shadow-none focus:ring-0 text-muted-foreground">
                            <SelectValue placeholder="Alltid (ingen villkor)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none">Alltid (ingen villkor)</SelectItem>
                            {yesNoQuestions.map((q, qi) => (
                              <SelectItem key={qi} value={q.id ?? `q-${qi}`}>{q.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {item.condition_question_id && item.condition_question_id !== "__none" && (
                          <Select
                            value={item.condition_answer ?? "ja"}
                            onValueChange={(v) => {
                              const items = [...f.items];
                              items[idx] = { ...items[idx], condition_answer: v };
                              setF((p) => ({ ...p, items }));
                            }}
                          >
                            <SelectTrigger className="h-6 w-16 border-0 bg-transparent p-0 text-[11px] shadow-none focus:ring-0 text-muted-foreground">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ja">Ja</SelectItem>
                              <SelectItem value="nej">Nej</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
              onClick={() => setF((p) => ({ ...p, items: [...p.items, { label: "", requires_photo: false, link_url: "" }] }))}
            >
              <Plus className="h-3.5 w-3.5" /> Lägg till steg
            </button>
          </div>

          {/* Frågor */}
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Frågor</p>
            <div className="space-y-2">
              {f.questions.map((q, idx) => (
                <div key={idx} className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder={`Fråga ${idx + 1}`}
                      value={q.label}
                      onChange={(e) => {
                        const qs = [...f.questions]; qs[idx] = { ...qs[idx], label: e.target.value };
                        setF((p) => ({ ...p, questions: qs }));
                      }}
                      className="flex-1 border-0 bg-transparent p-0 h-auto text-sm shadow-none focus-visible:ring-0"
                    />
                    <button type="button" onClick={() => setF((p) => ({ ...p, questions: p.questions.filter((_, i) => i !== idx) }))}>
                      <X className="h-3.5 w-3.5 text-muted-foreground/50" />
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground/40" />
                    <Input
                      placeholder="URL (valfri länk)"
                      value={q.link_url ?? ""}
                      onChange={(e) => { const qs = [...f.questions]; qs[idx] = { ...qs[idx], link_url: e.target.value }; setF((p) => ({ ...p, questions: qs })); }}
                      onBlur={(e) => { const v = ensureHttps(e.target.value); if (v !== (q.link_url ?? "")) { const qs = [...f.questions]; qs[idx] = { ...qs[idx], link_url: v }; setF((p) => ({ ...p, questions: qs })); } }}
                      className="flex-1 border-0 bg-transparent p-0 h-auto text-xs shadow-none focus-visible:ring-0 text-primary placeholder:text-muted-foreground/40"
                    />
                    {q.link_url && (
                      <a href={q.link_url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-primary hover:text-primary/70">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex gap-1">
                      {(["text", "yes_no"] as const).map((type) => (
                        <button key={type} type="button"
                          className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                            (q.question_type ?? "text") === type ? "bg-primary text-primary-foreground border-primary" : "border-border/60 text-muted-foreground hover:border-primary/50")}
                          onClick={() => { const qs = [...f.questions]; qs[idx] = { ...qs[idx], question_type: type }; setF((p) => ({ ...p, questions: qs })); }}>
                          {type === "text" ? "Text" : "Ja/Nej"}
                        </button>
                      ))}
                    </div>
                    <label className="flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer">
                      <Checkbox
                        checked={q.is_required}
                        onCheckedChange={(v) => { const qs = [...f.questions]; qs[idx] = { ...qs[idx], is_required: !!v }; setF((p) => ({ ...p, questions: qs })); }}
                        className="h-3 w-3"
                      />
                      Obligatorisk
                    </label>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
              onClick={() => setF((p) => ({ ...p, questions: [...p.questions, { label: "", question_type: "text", is_required: false, link_url: "" }] }))}
            >
              <Plus className="h-3.5 w-3.5" /> Lägg till fråga
            </button>
          </div>
        </div>

        {/* RIGHT: Properties sidebar */}
        <div className="w-64 shrink-0 overflow-y-auto border-l border-border/60 bg-muted/30">
          <div className="divide-y divide-border/50 pb-16">

            {/* Malltyp */}
            <div className="px-4 py-3 space-y-2">
              <span className="text-xs font-medium text-muted-foreground">Malltyp</span>
              <div className="flex gap-1.5">
                {(["regular", "base"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    className={cn(
                      "flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-colors",
                      f.template_type === type
                        ? type === "base"
                          ? "bg-amber-500 text-white border-amber-500"
                          : "bg-primary text-primary-foreground border-primary"
                        : "border-border/60 text-muted-foreground hover:border-primary/40"
                    )}
                    onClick={() => setF((p) => ({ ...p, template_type: type }))}
                  >
                    {type === "regular" ? "Vanlig mall" : "Grundmall"}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground/70">
                {f.template_type === "base"
                  ? "Grundmallar visas bara vid batchskapning och schemalagda körningar."
                  : "Vanliga mallar visas i mallväljaren vid manuell uppgiftsskapning."}
              </p>
            </div>

            {/* Kategori */}
            <div className="flex items-start gap-3 px-4 py-3">
              <div className="mt-0.5 h-4 w-4 shrink-0 flex items-center justify-center">
                <span className="text-xs text-muted-foreground/60">#</span>
              </div>
              <div className="flex flex-col gap-1 min-w-0 flex-1">
                <span className="text-xs text-muted-foreground">Kategori</span>
                <Input placeholder="t.ex. Rengöring" value={f.category} onChange={(e) => setF((p) => ({ ...p, category: e.target.value }))} className="h-7 border border-border/60 text-xs" />
              </div>
            </div>

            {/* Prioritet */}
            <div className="flex items-center gap-3 px-4 py-3">
              <AlertTriangle className="h-4 w-4 shrink-0 text-muted-foreground/60" />
              <span className="w-20 shrink-0 text-xs text-muted-foreground">Prioritet</span>
              <Select value={f.priority} onValueChange={(v) => setF((p) => ({ ...p, priority: v }))}>
                <SelectTrigger className="flex-1 h-7 border-0 bg-transparent p-0 text-xs font-medium shadow-none focus:ring-0 justify-end"><SelectValue /></SelectTrigger>
                <SelectContent>{["Låg", "Medel", "Hög", "Kritisk"].map((pr) => <SelectItem key={pr} value={pr}>{pr}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {/* Status */}
            <div className="flex items-center gap-3 px-4 py-3">
              <CheckCircle className="h-4 w-4 shrink-0 text-muted-foreground/60" />
              <span className="w-20 shrink-0 text-xs text-muted-foreground">Status</span>
              <Select value={f.status} onValueChange={(v) => setF((p) => ({ ...p, status: v as FormState["status"] }))}>
                <SelectTrigger className="flex-1 h-7 border-0 bg-transparent p-0 text-xs font-medium shadow-none focus:ring-0 justify-end"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TEMPLATE_STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Förfallodagar — locked for delivery tasks */}
            {f.is_delivery_task ? (
              <div className="flex items-center gap-3 px-4 py-3 opacity-50">
                <Clock className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  <span className="text-xs text-muted-foreground">Förfaller om (dagar)</span>
                  <span className="text-xs text-muted-foreground/60 italic">Bestäms av leveransschemat</span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 px-4 py-3">
                <Clock className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  <span className="text-xs text-muted-foreground">Förfaller om (dagar)</span>
                  <Input type="number" min={0} placeholder="t.ex. 1" value={f.due_date_offset} onChange={(e) => setF((p) => ({ ...p, due_date_offset: e.target.value }))} className="h-7 border border-border/60 text-xs" />
                </div>
              </div>
            )}

            {/* Förfallotid — locked for delivery tasks */}
            {f.is_delivery_task ? (
              <div className="flex items-center gap-3 px-4 py-3 opacity-50">
                <Clock className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  <span className="text-xs text-muted-foreground">Förfallotid (HH:MM)</span>
                  <span className="text-xs text-muted-foreground/60 italic">Bestäms av leveransschemat</span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 px-4 py-3">
                <Clock className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  <span className="text-xs text-muted-foreground">Förfallotid (HH:MM)</span>
                  <Input type="time" value={f.due_date_time} onChange={(e) => setF((p) => ({ ...p, due_date_time: e.target.value }))} className="h-7 border border-border/60 text-xs" />
                </div>
              </div>
            )}

            {/* Materialnummer / Mitt Coop-sortiment */}
            <div className="px-4 py-3 min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <Hash className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                <span className="text-xs text-muted-foreground shrink-0">
                  {mallArticleType === "ean" ? "EAN" : mallArticleType === "bnr" ? "BNR" : "Materialnummer"}
                </span>
                <div className="flex flex-1 items-center gap-1 min-w-0">
                  <input
                    value={f.sap_article_id}
                    onChange={(e) => setF((p) => ({ ...p, sap_article_id: e.target.value.replace(/\D/g, "") }))}
                    onBlur={(e) => { if (e.target.value.trim()) setMallArticlePrompt(e.target.value.trim()); }}
                    placeholder={mallArticleType === "ean" ? "t.ex. 7310865003294" : "t.ex. 1047133"}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    className="min-w-0 flex-1 border-0 bg-transparent text-right text-xs text-foreground placeholder:text-muted-foreground/40 outline-none focus:outline-none overflow-hidden"
                  />
                  <select
                    value={mallArticleType}
                    onChange={(e) => setMallArticleType(e.target.value as ArticleIdType)}
                    className="border-0 bg-transparent text-[10px] text-muted-foreground outline-none cursor-pointer shrink-0"
                  >
                    <option value="mat-nr">Mat-nr</option>
                    <option value="ean">EAN</option>
                    <option value="bnr">BNR</option>
                  </select>
                  {f.sap_article_id && (
                    <button type="button" onClick={() => setF((p) => ({ ...p, sap_article_id: "" }))} className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground/60 hover:text-destructive shrink-0">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
              {f.sap_article_id && (() => {
                const url = mallArticleType === "mat-nr"
                  ? (mittCoopUrl(f.sap_article_id, activeStore?.sap_site_id ?? null) ?? `https://mittcoop.coop.se/sortiment/articles/${f.sap_article_id.trim()}`)
                  : mittCoopSearchUrl(f.sap_article_id, activeStore?.sap_site_id ?? null);
                return url ? (
                  <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
                    <ExternalLink className="h-3 w-3" />
                    Öppna i Mitt Coop-sortiment
                  </a>
                ) : null;
              })()}
            </div>
            <div className="px-4 py-3 space-y-2">
              <div className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                <span className="text-xs text-muted-foreground flex-1">Tidsluckor (fleruppgifter)</span>
              </div>
              <p className="text-[11px] text-muted-foreground/70 pl-6">Genererar en separat uppgift för varje tid per period.</p>
              <div className="space-y-1.5 pl-6">
                {(f.time_slots ?? []).map((slot, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <Input
                      type="time"
                      value={slot}
                      onChange={(e) => {
                        const slots = [...(f.time_slots ?? [])];
                        slots[idx] = e.target.value;
                        setF((p) => ({ ...p, time_slots: slots }));
                      }}
                      className="h-7 flex-1 border border-border/60 text-xs"
                    />
                    <button type="button" onClick={() => setF((p) => ({ ...p, time_slots: (p.time_slots ?? []).filter((_, i) => i !== idx) }))}>
                      <X className="h-3.5 w-3.5 text-muted-foreground/50 hover:text-destructive" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors"
                  onClick={() => setF((p) => ({ ...p, time_slots: [...(p.time_slots ?? []), "08:00"] }))}
                >
                  <Plus className="h-3 w-3" /> Lägg till tid
                </button>
              </div>
            </div>

            {/* Återkommande — locked for delivery tasks since schedule is set by delivery plan */}
            <div className="px-4 py-3 space-y-2">
              <div className="flex items-center gap-3">
                <Repeat className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                <span className="w-20 shrink-0 text-xs text-muted-foreground">Återkommande</span>
                {f.is_delivery_task ? (
                  <span className="flex-1 text-xs text-right text-muted-foreground/60 italic">Bestäms av leveransschemat</span>
                ) : (
                  <Select value={f.recurrence_rule || "__none"} onValueChange={(v) => setF((p) => ({ ...p, recurrence_rule: v === "__none" ? "" : v, recurrence_interval: 1 }))}>
                    <SelectTrigger className="flex-1 h-7 border-0 bg-transparent p-0 text-xs shadow-none focus:ring-0 justify-end"><SelectValue placeholder="Ingen" /></SelectTrigger>
                    <SelectContent>{RECURRENCE_OPTIONS.map((o) => <SelectItem key={o.value === "" ? "__none" : o.value} value={o.value === "" ? "__none" : o.value}>{o.label}</SelectItem>)}</SelectContent>
                  </Select>
                )}
              </div>
              {f.recurrence_rule === "custom" && (
                <div className="flex items-center gap-2 pl-7">
                  <span className="text-[11px] text-muted-foreground">Var</span>
                  <input
                    type="number" min={1} max={365}
                    value={f.recurrence_interval}
                    onChange={(e) => setF((p) => ({ ...p, recurrence_interval: Math.max(1, parseInt(e.target.value) || 1) }))}
                    className="w-14 h-7 rounded-md border border-border/60 bg-background px-2 text-xs text-center"
                  />
                  <span className="text-[11px] text-muted-foreground">dag(ar)</span>
                </div>
              )}
              {(f.recurrence_rule === "weekly" || f.recurrence_rule === "biweekly") && (
                <div className="pl-7 space-y-1.5">
                  <div className="flex flex-wrap gap-1">
                    {WEEKDAYS.map((day, idx) => (
                      <button key={idx} type="button"
                        className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium border transition-colors",
                          f.recurrence_days.includes(idx) ? "bg-primary text-primary-foreground border-primary" : "border-border/60 text-muted-foreground hover:border-primary/50")}
                        onClick={() => {
                          const days = f.recurrence_days.includes(idx) ? f.recurrence_days.filter((d) => d !== idx) : [...f.recurrence_days, idx];
                          setF((p) => ({ ...p, recurrence_days: days }));
                        }}>
                        {day}
                      </button>
                    ))}
                  </div>
                  {f.recurrence_rule === "biweekly" && (
                    <p className="text-[11px] text-muted-foreground">Upprepas varannan vecka på valda dagar.</p>
                  )}
                </div>
              )}
              {f.recurrence_rule === "monthly" && (
                <div className="flex items-center gap-2 pl-7">
                  <span className="text-[11px] text-muted-foreground">Dag i månaden</span>
                  <input
                    type="number" min={1} max={31}
                    value={f.recurrence_month_day}
                    onChange={(e) => setF((p) => ({ ...p, recurrence_month_day: Math.min(31, Math.max(1, parseInt(e.target.value) || 1)) }))}
                    className="w-14 h-7 rounded-md border border-border/60 bg-background px-2 text-xs text-center"
                  />
                </div>
              )}
              {f.recurrence_rule === "quarterly" && (
                <div className="pl-7 space-y-1.5">
                  <p className="text-[11px] text-muted-foreground">Välj månader per kvartal</p>
                  <div className="space-y-1">
                    {QUARTER_MONTHS.map(({ q, months }) => (
                      <div key={q} className="flex items-center gap-1">
                        <span className="text-[11px] font-medium text-muted-foreground w-6">{q}</span>
                        {months.map(m => (
                          <button key={m} type="button"
                            className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium border transition-colors",
                              f.recurrence_months.includes(m) ? "bg-primary text-primary-foreground border-primary" : "border-border/60 text-muted-foreground hover:border-primary/50")}
                            onClick={() => {
                              const ms = f.recurrence_months.includes(m) ? f.recurrence_months.filter(x => x !== m) : [...f.recurrence_months, m];
                              setF((p) => ({ ...p, recurrence_months: ms }));
                            }}>
                            {MONTHS_SV[m]}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">Dag i månaden</span>
                    <input
                      type="number" min={1} max={31}
                      value={f.recurrence_month_day}
                      onChange={(e) => setF((p) => ({ ...p, recurrence_month_day: Math.min(31, Math.max(1, parseInt(e.target.value) || 1)) }))}
                      className="w-14 h-7 rounded-md border border-border/60 bg-background px-2 text-xs text-center"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Recurrence start/end dates — shown only when recurrence is set */}
            {f.recurrence_rule && (
              <div className="px-4 py-3 space-y-2">
                <span className="text-xs text-muted-foreground">Upprepningsperiod</span>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground w-10">Start</span>
                  <Input type="date" value={f.recurrence_start}
                    onChange={(e) => setF((p) => ({ ...p, recurrence_start: e.target.value }))}
                    className="flex-1 h-7 border border-border/60 text-xs" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground w-10">Slut</span>
                  <Input type="date" value={f.recurrence_end}
                    onChange={(e) => setF((p) => ({ ...p, recurrence_end: e.target.value }))}
                    className="flex-1 h-7 border border-border/60 text-xs" />
                </div>
                {!f.recurrence_end && (
                  <p className="text-[11px] text-muted-foreground/60">Inget slutdatum = 365 dagar framåt.</p>
                )}
              </div>
            )}

            {/* Förening selector — shown when scope is forening and user is admin */}
            {scope === "forening" && isAdmin && (
              <div className="px-4 py-3 space-y-1">
                <span className="text-xs text-muted-foreground">Publicera till förening</span>
                <Select value={f.foreningId || "__none"} onValueChange={(v) => setF((p) => ({ ...p, foreningId: v === "__none" ? "" : v }))}>
                  <SelectTrigger className="h-7 border border-border/60 text-xs"><SelectValue placeholder="Välj förening" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Välj förening</SelectItem>
                    {allForeningar.map((f2) => <SelectItem key={f2.id} value={f2.id}>{f2.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Locked — admin only, for HK templates */}
            {isAdmin && scope === "hk" && (
              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <span className="text-xs font-medium text-muted-foreground">Låst</span>
                  <p className="text-[10px] text-muted-foreground/60">Chefer kan inte redigera</p>
                </div>
                <Switch checked={f.isLocked} onCheckedChange={(v) => setF((p) => ({ ...p, isLocked: v }))} />
              </div>
            )}

            {/* Kritisk mall */}
            {f.template_type === "base" && f.recurrence_rule && (
              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <span className="text-xs font-medium text-muted-foreground">Kritisk rutin</span>
                  <p className="text-[10px] text-muted-foreground/60">Stoppas aldrig automatiskt</p>
                </div>
                <Switch checked={f.is_critical} onCheckedChange={(v) => setF((p) => ({ ...p, is_critical: v }))} />
              </div>
            )}

            {/* Händelsevillkor */}
            <div className="px-4 py-3 space-y-1">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                <span className="text-xs text-muted-foreground">Händelsevillkor</span>
              </div>
              <p className="text-[11px] text-muted-foreground/60 pl-6">Uppgiften döljs tills händelsen bekräftas.</p>
              <Input
                placeholder="t.ex. Truck lossat"
                value={f.event_trigger_description}
                onChange={(e) => setF((p) => ({ ...p, event_trigger_description: e.target.value }))}
                className="h-7 border border-border/60 text-xs"
              />
              {f.event_trigger_description && (
                <div className="pl-0 space-y-1 pt-1">
                  <span className="text-[11px] text-muted-foreground/70">Bekräftas av</span>
                  <Select
                    value={f.event_trigger_user_id || "__any"}
                    onValueChange={(v) => setF((p) => ({ ...p, event_trigger_user_id: v === "__any" ? "" : v }))}
                  >
                    <SelectTrigger className="h-7 text-xs border-border/60">
                      <SelectValue placeholder="Vem som helst" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__any">Vem som helst</SelectItem>
                      {allUsers.filter(u => !activeStore || u.store_id === activeStore.id).map((u) => (
                        <SelectItem key={u.id} value={u.id}>{u.display_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Leveransuppgift */}
            <div className="px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Truck className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                  <span className="text-xs text-muted-foreground">Leveransuppgift</span>
                </div>
                <Switch
                  checked={f.is_delivery_task}
                  onCheckedChange={(v) => setF((p) => ({ ...p, is_delivery_task: v }))}
                />
              </div>
              {f.is_delivery_task && (
                <div className="pl-6 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground">Koppla till leveranser</span>
                    {deliveryWeekEntries.length > 1 && (() => {
                      const allKeys = deliveryWeekEntries.map(e => `${e.delivery_day}||${e.supplier?.trim()}||${e.flow_name?.trim()}`);
                      const currentKeys = new Set((f.delivery_entry_keys ?? "").split("|").map(s => s.trim()).filter(s => s.includes("||")));
                      const allSelected = allKeys.every(k => currentKeys.has(k));
                      return (
                        <button
                          type="button"
                          className="text-[11px] text-primary hover:underline"
                          onClick={() => {
                            if (allSelected) {
                              setF(p => ({ ...p, delivery_entry_keys: "", delivery_supplier_name: "", delivery_flow_name: "" }));
                            } else {
                              const allSupp = [...new Set(deliveryWeekEntries.map(e => e.supplier?.trim() ?? "").filter(Boolean))];
                              const allFlow = [...new Set(deliveryWeekEntries.map(e => e.flow_name?.trim() ?? "").filter(Boolean))];
                              setF(p => ({ ...p, delivery_entry_keys: allKeys.join("|"), delivery_supplier_name: allSupp.join("|"), delivery_flow_name: allFlow.join("|") }));
                            }
                          }}
                        >
                          {allSelected ? "Avmarkera alla" : "Välj alla"}
                        </button>
                      );
                    })()}
                  </div>
                  {deliveryWeekEntries.length > 0 ? (() => {
                    const dayOrder = ["Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag", "Söndag"];
                    const byDay = deliveryWeekEntries.reduce<Record<string, typeof deliveryWeekEntries>>((acc, e) => {
                      const k = e.delivery_day || "Okänd dag";
                      if (!acc[k]) acc[k] = [];
                      acc[k].push(e);
                      return acc;
                    }, {});
                    const sortedDays = Object.keys(byDay).sort((a, b) => {
                      const ai = dayOrder.indexOf(a);
                      const bi = dayOrder.indexOf(b);
                      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
                    });
                    // Selection is per-entry: key = "Day||Supplier||Flow"
                    // Stored in delivery_entry_keys; supplier+flow kept in sync for batch create matching
                    const selectedKeys = new Set(
                      (f.delivery_entry_keys ?? "").split("|").map(s => s.trim()).filter(s => s.includes("||"))
                    );
                    const entryKey = (e: { delivery_day: string; supplier: string; flow_name: string }) =>
                      `${e.delivery_day}||${e.supplier?.trim()}||${e.flow_name?.trim()}`;

                    const syncSupplierFlow = (keys: Set<string>) => {
                      const entries = deliveryWeekEntries.filter(e => keys.has(entryKey(e)));
                      return {
                        delivery_supplier_name: [...new Set(entries.map(e => e.supplier?.trim() ?? "").filter(Boolean))].join("|"),
                        delivery_flow_name: [...new Set(entries.map(e => e.flow_name?.trim() ?? "").filter(Boolean))].join("|"),
                      };
                    };

                    const toggleEntry = (entry: typeof deliveryWeekEntries[0]) => {
                      const k = entryKey(entry);
                      const next = new Set(selectedKeys);
                      if (next.has(k)) next.delete(k); else next.add(k);
                      setF(p => ({ ...p, delivery_entry_keys: [...next].join("|"), ...syncSupplierFlow(next) }));
                    };

                    const toggleDay = (entries: typeof deliveryWeekEntries) => {
                      const dayKeys = entries.map(entryKey);
                      const allSelected = dayKeys.every(k => selectedKeys.has(k));
                      const next = new Set(selectedKeys);
                      if (allSelected) { dayKeys.forEach(k => next.delete(k)); } else { dayKeys.forEach(k => next.add(k)); }
                      setF(p => ({ ...p, delivery_entry_keys: [...next].join("|"), ...syncSupplierFlow(next) }));
                    };

                    return (
                      <div className="space-y-1.5 rounded-lg border border-border/50 p-2 max-h-56 overflow-y-auto">
                        {sortedDays.map(dayName => {
                          const entries = byDay[dayName];
                          const dayKeys = entries.map(entryKey);
                          const allDaySelected = dayKeys.every(k => selectedKeys.has(k));
                          const someDaySelected = dayKeys.some(k => selectedKeys.has(k));
                          return (
                            <div key={dayName} className="space-y-0.5">
                              <label className="flex cursor-pointer items-center gap-2.5 rounded px-1.5 py-1.5 bg-muted/30 hover:bg-muted/50">
                                <Checkbox
                                  checked={allDaySelected}
                                  data-state={someDaySelected && !allDaySelected ? "indeterminate" : undefined}
                                  onCheckedChange={() => toggleDay(entries)}
                                  className="h-3.5 w-3.5"
                                />
                                <span className="text-xs font-semibold flex-1">{dayName}</span>
                                <span className="text-[10px] text-muted-foreground">{entries.length} leverans{entries.length !== 1 ? "er" : ""}</span>
                              </label>
                              {entries.map(entry => {
                                const checked = selectedKeys.has(entryKey(entry));
                                return (
                                  <label key={entry.id} className="flex cursor-pointer items-center gap-2.5 rounded px-1.5 py-1.5 pl-6 hover:bg-muted/50">
                                    <Checkbox
                                      checked={checked}
                                      onCheckedChange={() => toggleEntry(entry)}
                                      className="h-3.5 w-3.5"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <span className="text-xs">{entry.supplier}</span>
                                      <span className="text-[10px] text-muted-foreground ml-1.5">{entry.flow_name}</span>
                                    </div>
                                    {entry.delivery_time && (
                                      <span className="text-[11px] font-medium text-foreground/70 tabular-nums shrink-0">{entry.delivery_time}</span>
                                    )}
                                  </label>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })() : (
                    <div className="space-y-1">
                      <Input
                        placeholder="t.ex. Färskt"
                        value={f.delivery_flow_name}
                        onChange={(e) => setF((p) => ({ ...p, delivery_flow_name: e.target.value }))}
                        className="h-7 border border-border/60 text-xs"
                      />
                      <p className="text-[10px] text-muted-foreground/60">Inga leveranser i aktiv plan — ange flödesnamn manuellt</p>
                    </div>
                  )}
                  {f.delivery_entry_keys && (
                    <p className="text-[10px] text-muted-foreground/60">
                      {f.delivery_entry_keys.split("|").filter(s => s.includes("||")).length} specifik{f.delivery_entry_keys.split("|").filter(s => s.includes("||")).length !== 1 ? "a" : ""} leverans{f.delivery_entry_keys.split("|").filter(s => s.includes("||")).length !== 1 ? "er" : ""} vald{f.delivery_entry_keys.split("|").filter(s => s.includes("||")).length !== 1 ? "a" : ""}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Kedja / Beror på */}
            <div className="px-4 py-3 space-y-1">
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                <span className="text-xs text-muted-foreground">Beror på mall</span>
              </div>
              <p className="text-[11px] text-muted-foreground/60 pl-6">Uppgiften blockeras tills föregångarmallen är klar.</p>
              <div className="pl-0 space-y-1">
                <Select
                  value={f.depends_on_template_title || "__none__"}
                  onValueChange={(v) => setF((p) => ({ ...p, depends_on_template_title: v === "__none__" ? "" : v }))}
                >
                  <SelectTrigger className="h-7 border border-border/60 text-xs">
                    <SelectValue placeholder="Ingen beroende" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Ingen beroende</SelectItem>
                    {templates
                      .filter(t => t.title.trim() && t.title !== f.title)
                      .sort((a, b) => a.title.localeCompare(b.title, "sv"))
                      .map(t => (
                        <SelectItem key={t.id} value={t.title}>{t.title}</SelectItem>
                      ))
                    }
                  </SelectContent>
                </Select>
                {f.depends_on_template_title && (
                  <p className="text-[10px] text-blue-600 pl-1">
                    Kräver att "{f.depends_on_template_title}" skapas i samma batch eller redan existerar.
                  </p>
                )}
              </div>
            </div>

            {/* Granskningsintervall */}
            {f.template_type === "base" && f.recurrence_rule && (
              <div className="px-4 py-3 space-y-1">
                <div className="flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                  <span className="text-xs text-muted-foreground">Granskningsintervall (månader)</span>
                </div>
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={f.review_interval_months}
                  onChange={(e) => setF((p) => ({ ...p, review_interval_months: Math.max(1, parseInt(e.target.value) || 24) }))}
                  className="h-7 border border-border/60 text-xs"
                />
                <p className="text-[11px] text-muted-foreground/60">Chef aviseras när granskningstiden löpt ut.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-8 md:px-8 md:py-10">
      <PageHeader
        title="Mallar"
        description="Återanvändbara checklistor och rutiner."
        actions={
          <div className="flex flex-wrap gap-2">
            {/* Import dialog */}
            <ImportDialog
              open={showImportDialog}
              onClose={() => setShowImportDialog(false)}
              onImport={importCSV}
              title="Importera mallar"
              description="Ladda upp en CSV-fil med mallar. Rader som börjar med # ignoreras."
              loading={importing}
              importLabel="Importera mallar"
              options={[
                ...(isAdmin ? [{
                  key: "scope",
                  type: "select" as const,
                  label: "Malltyp",
                  description: "Välj om mallarna ska skapas som HK-, förenings- eller butiksmallar",
                  options: [
                    { value: "store", label: "Butiksmall (aktiv butik)" },
                    { value: "hk", label: "HK-mall (global)" },
                    { value: "forening", label: "Föreningsmall" },
                  ],
                  defaultValue: "store",
                }, {
                  key: "foreningId",
                  type: "select" as const,
                  label: "Förening",
                  description: "Vilken förening ska föreningsmallar publiceras till",
                  options: [{ value: "__none", label: "Välj förening..." }, ...allForeningar.map(f => ({ value: f.id, label: f.name }))],
                  defaultValue: "__none",
                  showWhen: { key: "scope", value: "forening" },
                }] : isForening ? [{
                  key: "scope",
                  type: "select" as const,
                  label: "Malltyp",
                  options: [
                    { value: "forening", label: "Föreningsmall" },
                    { value: "store", label: "Butiksmall" },
                  ],
                  defaultValue: "forening",
                }, {
                  key: "foreningId",
                  type: "select" as const,
                  label: "Förening",
                  description: "Vilken förening ska mallarna publiceras till",
                  options: [{ value: "__none", label: "Välj förening..." }, ...allForeningar.map(f => ({ value: f.id, label: f.name }))],
                  defaultValue: user?.forening_id ?? "__none",
                  showWhen: { key: "scope", value: "forening" },
                }] : []),
              ]}
            />
            {isManager && (
              <Button variant="outline" className="hidden sm:flex rounded-full" onClick={downloadBlankTemplate}>
                <Download className="mr-2 h-4 w-4" /> CSV-mall
              </Button>
            )}
            {isManager && (
              <Button variant="outline" className="hidden sm:flex rounded-full" onClick={exportCSV}>
                <Download className="mr-2 h-4 w-4" /> Exportera
              </Button>
            )}
            {isManager && (
              <Button variant="outline" className="hidden sm:flex rounded-full" disabled={importing} onClick={() => setShowImportDialog(true)}>
                <Upload className="mr-2 h-4 w-4" /> {importing ? "Importerar..." : "Importera CSV"}
              </Button>
            )}
            {isManager && (
              <Button variant="outline" className="hidden sm:flex rounded-full" onClick={() => setShowPackagesPanel(true)}>
                <Layers className="mr-2 h-4 w-4" /> Mallpaket
              </Button>
            )}
            {canCreateHK && (
              <Button variant="outline" className="hidden sm:flex rounded-full border-blue-300 text-blue-600 hover:bg-blue-50" onClick={() => openCreate("hk")}>
                <Plus className="mr-2 h-4 w-4" /> Ny HK-mall
              </Button>
            )}
            {canCreateForening && (
              <Button variant="outline" className="hidden sm:flex rounded-full border-teal-300 text-teal-600 hover:bg-teal-50" onClick={() => openCreate("forening")}>
                <Building2 className="mr-2 h-4 w-4" /> Ny föreningsmall
              </Button>
            )}
            {isManager && (
              <Button className="hidden sm:flex rounded-full" onClick={() => openCreate("store")}>
                <Plus className="mr-2 h-4 w-4" /> Ny butiksmall
              </Button>
            )}
          </div>
        }
      />

      {/* Bulk action bar */}
      {selectedTemplateIds.size > 0 && isManager && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5">
          <span className="text-sm font-medium text-foreground">{selectedTemplateIds.size} mallar markerade</span>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" size="sm" className="rounded-full h-8 text-xs" onClick={() => setSelectedTemplateIds(new Set())}>
              Avmarkera alla
            </Button>
            <Button size="sm" className="rounded-full h-8 gap-1.5 text-xs bg-primary text-primary-foreground" onClick={openBulkCreate}>
              <ListChecks className="h-3.5 w-3.5" /> Skapa uppgifter
            </Button>
            {[...selectedTemplateIds].every((id) => { const t = templates.find((x) => x.id === id); return t ? canDelete(t) : false; }) && (
              <Button variant="destructive" size="sm" className="rounded-full h-8 gap-1.5 text-xs" onClick={() => setBulkDeleteTemplatesOpen(true)}>
                <Trash2 className="h-3.5 w-3.5" /> Ta bort markerade
              </Button>
            )}
          </div>
        </div>
      )}

      {/* View filter tabs */}
      <div className="mt-4 flex flex-wrap gap-3 items-center">
        <div className="flex gap-1 rounded-xl border border-border/60 bg-muted/30 p-1">
          {[
            { key: "all", label: "Alla" },
            { key: "hk", label: "HK" },
            { key: "forening", label: "Förening" },
            { key: "store", label: "Butik" },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setViewFilter(key as typeof viewFilter)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                viewFilter === key ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-40 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Sök mallar..."
            className="h-8 w-full rounded-lg border border-border/60 bg-background pl-8 pr-3 text-xs outline-none placeholder:text-muted-foreground/50 focus:border-primary/40"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2">
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Category filter */}
        {allCategories.length > 0 && (
          <Select value={filterCategory || "__all"} onValueChange={(v) => setFilterCategory(v === "__all" ? "" : v)}>
            <SelectTrigger className="h-8 w-36 text-xs rounded-lg">
              <SelectValue placeholder="Kategori" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Alla kategorier</SelectItem>
              {allCategories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        {/* Priority filter */}
        <Select value={filterPriority || "__all"} onValueChange={(v) => setFilterPriority(v === "__all" ? "" : v)}>
          <SelectTrigger className="h-8 w-32 text-xs rounded-lg">
            <SelectValue placeholder="Prioritet" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Alla prioriteter</SelectItem>
            {["Låg", "Medel", "Hög", "Kritisk"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>

        {/* Clear filters */}
        {(search || filterCategory || filterPriority) && (
          <button
            onClick={() => { setSearch(""); setFilterCategory(""); setFilterPriority(""); }}
            className="flex items-center gap-1 rounded-full border border-border/60 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3 w-3" /> Rensa filter
          </button>
        )}

        {/* Select all */}
        {isManager && filteredTemplates.length > 0 && (
          <button
            onClick={() => {
              if (selectedTemplateIds.size === filteredTemplates.length) {
                setSelectedTemplateIds(new Set());
              } else {
                setSelectedTemplateIds(new Set(filteredTemplates.map(t => t.id)));
              }
            }}
            className="flex items-center gap-1 rounded-full border border-border/60 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors ml-auto"
          >
            {selectedTemplateIds.size === filteredTemplates.length && filteredTemplates.length > 0 ? "Avmarkera alla" : "Markera alla"}
          </button>
        )}
      </div>

      {loading ? (
        <div className="mt-6 space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-card" />)}</div>
      ) : filteredTemplates.length === 0 && templates.length === 0 ? (
        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-card py-16 text-center">
          <p className="text-sm font-medium text-muted-foreground">Inga mallar ännu</p>
          {isManager && (
            <Button className="mt-4 rounded-full" size="sm" onClick={() => openCreate("store")}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Skapa mall
            </Button>
          )}
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-card py-12 text-center">
          <p className="text-sm font-medium text-muted-foreground">Inga mallar matchar sökningen</p>
          <button onClick={() => { setSearch(""); setFilterCategory(""); setFilterPriority(""); }} className="mt-3 text-xs text-primary hover:underline">Rensa filter</button>
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {/* 24-month review banners — shown to managers for overdue/due-soon recurring base templates */}
          {isManager && (() => {
            const now = new Date();
            const warningThreshold = new Date(now); warningThreshold.setMonth(warningThreshold.getMonth() + 3);
            const overdueTemplates = templates.filter(t => {
              const nextReview = (t as ChecklistTemplate & { next_review_at?: string }).next_review_at;
              return nextReview && new Date(nextReview) <= warningThreshold && t.status !== "archived";
            });
            if (overdueTemplates.length === 0) return null;
            const isOverdue = (t: TemplateWithMeta) => {
              const nr = (t as ChecklistTemplate & { next_review_at?: string }).next_review_at;
              return nr && new Date(nr) <= now;
            };
            return (
              <div className="space-y-2">
                {overdueTemplates.map(t => {
                  const overdue = isOverdue(t);
                  const nr = (t as ChecklistTemplate & { next_review_at?: string }).next_review_at!;
                  const monthsLeft = Math.ceil((new Date(nr).getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30));
                  return (
                    <div key={t.id} className={cn(
                      "flex items-center justify-between gap-3 rounded-xl border px-4 py-3",
                      overdue
                        ? "border-destructive/30 bg-destructive/5"
                        : "border-amber-200 bg-amber-50/60"
                    )}>
                      <div className="flex items-center gap-2 min-w-0">
                        <AlertTriangle className={cn("h-4 w-4 shrink-0", overdue ? "text-destructive" : "text-amber-600")} />
                        <div className="min-w-0">
                          <p className={cn("text-sm font-medium truncate", overdue ? "text-destructive" : "text-amber-800")}>
                            {overdue ? "Granskning försenad" : `Granskning om ${monthsLeft} månad${monthsLeft !== 1 ? "er" : ""}`}
                            <span className="ml-1.5 font-normal opacity-80">— {t.title}</span>
                          </p>
                          <p className={cn("text-xs", overdue ? "text-destructive/70" : "text-amber-700/70")}>
                            Mallen har kört sedan skapandet. Bekräfta att rutinen fortfarande behövs.
                          </p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant={overdue ? "destructive" : "outline"}
                        className={cn("shrink-0 rounded-full h-7 text-xs", !overdue && "border-amber-400 text-amber-800 hover:bg-amber-100")}
                        onClick={() => setReviewTarget(t)}
                      >
                        Granska
                      </Button>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Template packages section — hidden by default, toggled via button */}
          {packages.length > 0 && isManager && (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <h2 className="text-sm font-semibold text-foreground">Mallpaket</h2>
                <Badge variant="outline" className="text-xs border-amber-300 text-amber-600">Paket</Badge>
                <button
                  onClick={() => setShowPackagesInline(v => !v)}
                  className="flex items-center gap-1 rounded-full border border-border/60 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPackagesInline ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  {showPackagesInline ? "Dölj" : `Visa (${packages.length})`}
                </button>
                <Button variant="ghost" size="sm" className="ml-auto text-xs text-muted-foreground h-7 rounded-full" onClick={() => setShowPackagesPanel(true)}>
                  <Layers className="h-3.5 w-3.5 mr-1" /> Hantera
                </Button>
              </div>
              {showPackagesInline && (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {packages.map(pkg => {
                    const pkgTemplates = (pkg.items ?? []).map(it => templates.find(t => t.id === it.template_id)).filter(Boolean) as TemplateWithMeta[];
                    return (
                      <div key={pkg.id} className="rounded-2xl border border-amber-200/60 bg-card p-4 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-sm">{pkg.name}</p>
                            {pkg.description && <p className="text-xs text-muted-foreground">{pkg.description}</p>}
                            <p className="text-xs text-muted-foreground mt-0.5">{pkgTemplates.length} mallar</p>
                          </div>
                          <Button
                            size="sm" variant="outline"
                            className="shrink-0 rounded-full h-7 text-xs border-amber-300 text-amber-700 hover:bg-amber-50"
                            onClick={() => { setActivatePackageTarget(pkg); const _now = new Date(); setBulkTaskConfigs(pkgTemplates.map(t => { const slots = (t as ChecklistTemplate & { time_slots?: string[] }).time_slots ?? []; const dd = t.due_date_offset != null ? (() => { const d = new Date(_now); d.setDate(d.getDate() + t.due_date_offset!); return d.toISOString().slice(0, 10); })() : ""; return { templateId: t.id, assigneeUserIds: [], assigneeGroupIds: [], dueDate: dd, priority: t.priority ?? "Medel", dueTime: slots.length > 0 ? "" : (t.due_date_time ?? ""), timeSlots: slots }; })); setBulkCreateOpen(true); }}
                          >
                            <ListChecks className="h-3 w-3 mr-1" /> Aktivera
                          </Button>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {pkgTemplates.map(t => (
                            <Badge key={t.id} variant="secondary" className="text-xs">{t.title}</Badge>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {visibleGroups.map((group) => (
            <div key={group.label}>
              <div className="mb-3 flex items-center gap-2">
                <h2 className="text-sm font-semibold text-foreground">{group.label}</h2>
                <Badge variant="outline" className={cn("text-xs", group.badgeClass)}>{group.badge}</Badge>
                <span className="text-xs text-muted-foreground">{group.items.length} mallar</span>
              </div>
              {group.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">Inga mallar i denna kategori.</p>
              ) : (
                <div className="space-y-3">
                  {group.items.map((t) => {
                    const scopeBadge = getTemplateBadge(t);
                    const isHidden = isHiddenForMyForening(t);
                    const nestedVariants = variantsByParent.get(t.id) ?? [];
                    return (
                      <div key={t.id}>
                      <div
                        className={cn(
                          "overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[var(--shadow-sm)]",
                          isHidden && "opacity-60"
                        )}
                      >
                        <div className="flex w-full items-center justify-between hover:bg-muted/20">
                          {isManager && (
                            <div className="pl-4 shrink-0" onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={selectedTemplateIds.has(t.id)}
                                onCheckedChange={(checked) => {
                                  const next = new Set(selectedTemplateIds);
                                  if (checked) next.add(t.id); else next.delete(t.id);
                                  setSelectedTemplateIds(next);
                                }}
                              />
                            </div>
                          )}
                          <button
                            className="flex flex-1 items-center gap-3 px-5 py-4 text-left"
                            onClick={() => setExpanded(expanded === t.id ? null : t.id)}
                          >
                            {expanded === t.id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                            <div>
                              <p className="font-medium">
                                {t.title}
                                {isHidden && <span className="ml-2 text-xs text-muted-foreground">(dold för din förening)</span>}
                                {t.parent_template_id && (
                                  <span className="ml-2 inline-flex items-center gap-0.5 text-xs text-muted-foreground/70">
                                    <GitBranch className="h-3 w-3" />
                                    {t.inherit_mode === "variant" ? "Variant" : "Kopia"}
                                  </span>
                                )}
                              </p>
                              <div className="mt-0.5 flex items-center gap-2 flex-wrap">
                                {t.category && <Badge variant="secondary" className="text-xs">{t.category}</Badge>}
                                {(t as ChecklistTemplate & { template_type?: string }).template_type === "base" && (
                                  <Badge variant="outline" className="text-xs border-amber-400 text-amber-700 bg-amber-50">Grundmall</Badge>
                                )}
                                {(t as ChecklistTemplate & { is_critical?: boolean }).is_critical && (
                                  <Badge variant="outline" className="text-xs border-red-300 text-red-600">Kritisk</Badge>
                                )}
                                {scopeBadge && (
                                  <Badge variant="outline" className={cn("text-xs", scopeBadge.cls)}>{scopeBadge.label}</Badge>
                                )}
                                {(() => { const sb = getStatusBadge(t); return sb.value !== "active" ? <Badge variant="outline" className={cn("text-xs border", sb.cls)}>{sb.label}</Badge> : null; })()}
                                {t.locked_by_admin && !t.is_global && (
                                  <Badge variant="outline" className="text-xs border-amber-300 text-amber-600">Skrivskyddad</Badge>
                                )}
                                <span className="text-xs text-muted-foreground">{t.items?.length ?? 0} steg</span>
                                {(t.questions?.length ?? 0) > 0 && <span className="text-xs text-muted-foreground">{t.questions?.length} frågor</span>}
                                {(t.version ?? 1) > 1 && <span className="text-xs text-muted-foreground/60">v{t.version}</span>}
                              </div>
                            </div>
                          </button>

                          <div className="mr-3 flex items-center gap-1">
                            {/* Preview */}
                            <Button
                              variant="ghost" size="icon"
                              className="hidden sm:inline-flex rounded-full text-muted-foreground hover:text-foreground"
                              onClick={(e) => { e.stopPropagation(); setPreviewTarget(t); }}
                              title="Förhandsgranska"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            {/* Förening can toggle hide/show HK templates */}
                            {isForening && (t.hierarchy_scope === "hk" || t.is_global) && (
                              <Button
                                variant="ghost" size="icon"
                                className={cn("rounded-full", isHidden ? "text-amber-500 hover:text-amber-600" : "text-muted-foreground hover:text-foreground")}
                                onClick={(e) => { e.stopPropagation(); toggleHideHKTemplate(t); }}
                                title={isHidden ? "Visa HK-mall för din förening" : "Dölj HK-mall för din förening"}
                              >
                                {isHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                              </Button>
                            )}
                            {/* Version history */}
                            {isManager && (
                              <Button
                                variant="ghost" size="icon"
                                className="hidden sm:inline-flex rounded-full text-muted-foreground hover:text-foreground"
                                onClick={(e) => { e.stopPropagation(); void loadVersionHistory(t); }}
                                title="Versionshistorik"
                              >
                                <History className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {/* For HK/Forening templates: non-admin managers get a pencil that auto-creates a local store variant */}
                            {isManager && !isAdmin && !canEdit(t) && (t.hierarchy_scope === "hk" || t.hierarchy_scope === "forening") && (
                              <Button
                                variant="ghost" size="icon"
                                className="hidden sm:inline-flex rounded-full text-muted-foreground hover:text-primary"
                                onClick={(e) => { e.stopPropagation(); void createLocalVariantAndEdit(t); }}
                                aria-label="Redigera (skapar lokal variant)"
                                title="Redigera — skapar lokal variant för din butik"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {canEdit(t) && (
                              <Button
                                variant="ghost" size="icon"
                                className="hidden sm:inline-flex rounded-full text-muted-foreground hover:text-primary"
                                onClick={(e) => { e.stopPropagation(); openEdit(t); }}
                                aria-label="Redigera"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {canDelete(t) && (
                              <Button
                                variant="ghost" size="icon"
                                className="hidden sm:inline-flex rounded-full text-muted-foreground hover:text-destructive"
                                onClick={(e) => { e.stopPropagation(); setDeleteTarget(t); }}
                                aria-label="Ta bort"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>

                        {expanded === t.id && (
                          <div className="border-t border-border/60 px-5 py-4 space-y-3">
                            {t.description && <p className="text-sm text-muted-foreground">{t.description}</p>}
                            {/* Special type indicators */}
                            <div className="flex flex-wrap gap-2">
                              {(t as ChecklistTemplate & { is_delivery_task?: boolean }).is_delivery_task && (
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700">
                                  <Truck className="h-3 w-3" />
                                  Leveransuppgift
                                  {(t as ChecklistTemplate & { delivery_supplier_name?: string }).delivery_supplier_name && (
                                    <span className="opacity-70">— {(t as ChecklistTemplate & { delivery_supplier_name?: string }).delivery_supplier_name}</span>
                                  )}
                                  {!(t as ChecklistTemplate & { delivery_supplier_name?: string }).delivery_supplier_name && (t as ChecklistTemplate & { delivery_flow_name?: string }).delivery_flow_name && (
                                    <span className="opacity-70">— {(t as ChecklistTemplate & { delivery_flow_name?: string }).delivery_flow_name}</span>
                                  )}
                                </span>
                              )}
                              {(t as ChecklistTemplate & { event_trigger_description?: string }).event_trigger_description && (
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">
                                  <Zap className="h-3 w-3" />
                                  {(t as ChecklistTemplate & { event_trigger_description?: string }).event_trigger_description}
                                </span>
                              )}
                              {(t as ChecklistTemplate & { depends_on_template_title?: string }).depends_on_template_title && (
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                                  <Link2 className="h-3 w-3" />
                                  Beror på: {(t as ChecklistTemplate & { depends_on_template_title?: string }).depends_on_template_title}
                                </span>
                              )}
                              {((t as ChecklistTemplate & { time_slots?: string[] }).time_slots ?? []).length > 0 && (
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                                  <Clock className="h-3 w-3" />
                                  {((t as ChecklistTemplate & { time_slots?: string[] }).time_slots ?? []).join(", ")}
                                </span>
                              )}
                            </div>
                            {(t as ChecklistTemplate & { sap_article_id?: string | null }).sap_article_id && (() => {
                              const url = mittCoopUrl((t as ChecklistTemplate & { sap_article_id?: string | null }).sap_article_id!, activeStore?.sap_site_id ?? null);
                              return url ? (
                                <a href={url} target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary-soft px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15 w-fit">
                                  <Hash className="h-3 w-3" />
                                  {(t as ChecklistTemplate & { sap_article_id?: string | null }).sap_article_id}
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              ) : (
                                <p className="text-xs text-muted-foreground font-mono">
                                  Materialnummer: {(t as ChecklistTemplate & { sap_article_id?: string | null }).sap_article_id}
                                </p>
                              );
                            })()}
                            {(t.items?.length ?? 0) > 0 && (
                              <div>
                                <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Checkpoints</p>
                                <ol className="space-y-2">
                                  {(t.items ?? []).sort((a, b) => a.sort_order - b.sort_order).map((item: ChecklistTemplateItem, idx: number) => (
                                    <li key={item.id} className="flex items-center gap-2.5 text-sm">
                                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">{idx + 1}</span>
                                      <span className="flex-1">{item.label}</span>
                                      {item.requires_photo && <Badge variant="secondary" className="text-xs">Foto krävs</Badge>}
                                      {(item as ChecklistTemplateItem & { link_url?: string }).link_url && (
                                        <a href={(item as ChecklistTemplateItem & { link_url?: string }).link_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/20 transition-colors">
                                          <ExternalLink className="h-3 w-3" />Länk
                                        </a>
                                      )}
                                    </li>
                                  ))}
                                </ol>
                              </div>
                            )}
                            {(t.questions?.length ?? 0) > 0 && (
                              <div>
                                <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Frågor</p>
                                <ol className="space-y-2">
                                  {(t.questions ?? []).sort((a, b) => a.sort_order - b.sort_order).map((q: ChecklistTemplateQuestion, idx: number) => (
                                    <li key={q.id} className="flex items-center gap-2.5 text-sm">
                                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">{idx + 1}</span>
                                      <span>{q.label}</span>
                                      {q.question_type === "yes_no" && <Badge variant="secondary" className="text-xs">Ja/Nej</Badge>}
                                      {q.is_required && <Badge variant="secondary" className="text-xs text-destructive">Obligatorisk</Badge>}
                                    </li>
                                  ))}
                                </ol>
                              </div>
                            )}
                            {t.storeIds.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                <span className="text-xs text-muted-foreground">Tilldelade butiker:</span>
                                {t.storeIds.map((sid) => {
                                  const s = allStores.find((st) => st.id === sid);
                                  return s ? <Badge key={sid} variant="outline" className="text-xs">{s.name}</Badge> : null;
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Nested local variants for this parent */}
                      {nestedVariants.map((v) => {
                        const isStale = v.created_at < t.updated_at;
                        return (
                          <div key={v.id} className="ml-6 mt-1.5">
                            {/* Stale variant banner */}
                            {isStale && (
                              <div className="mb-1.5 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400">
                                <span className="flex items-center gap-1.5">
                                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                  Den centrala mallen har uppdaterats sedan din lokala variant skapades.
                                </span>
                                <button
                                  className="ml-3 shrink-0 font-medium underline underline-offset-2 hover:no-underline"
                                  onClick={() => setMergeTarget({ variant: v, parent: t })}
                                >
                                  Granska &amp; synka
                                </button>
                              </div>
                            )}
                            <div className="overflow-hidden rounded-2xl border border-border/40 bg-card/80 shadow-[var(--shadow-sm)]">
                              <div className="flex w-full items-center justify-between hover:bg-muted/20">
                                {isManager && (
                                  <div className="pl-4 shrink-0" onClick={(e) => e.stopPropagation()}>
                                    <Checkbox
                                      checked={selectedTemplateIds.has(v.id)}
                                      onCheckedChange={(checked) => {
                                        const next = new Set(selectedTemplateIds);
                                        if (checked) next.add(v.id); else next.delete(v.id);
                                        setSelectedTemplateIds(next);
                                      }}
                                    />
                                  </div>
                                )}
                                <button
                                  className="flex flex-1 items-center gap-3 px-5 py-3.5 text-left"
                                  onClick={() => setExpanded(expanded === v.id ? null : v.id)}
                                >
                                  {expanded === v.id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                                  <div>
                                    <p className="font-medium text-sm">
                                      {v.title}
                                      <span className="ml-2 inline-flex items-center gap-0.5 text-xs text-primary/70">
                                        <GitBranch className="h-3 w-3" />
                                        Lokal variant
                                      </span>
                                    </p>
                                    <div className="mt-0.5 flex items-center gap-2 flex-wrap">
                                      {v.category && <Badge variant="secondary" className="text-xs">{v.category}</Badge>}
                                      <span className="text-xs text-muted-foreground">{v.items?.length ?? 0} steg</span>
                                    </div>
                                  </div>
                                </button>
                                <div className="mr-3 flex items-center gap-1">
                                  {canEdit(v) && (
                                    <Button
                                      variant="ghost" size="icon"
                                      className="hidden sm:inline-flex rounded-full text-muted-foreground hover:text-primary"
                                      onClick={(e) => { e.stopPropagation(); openEdit(v); }}
                                      aria-label="Redigera lokal variant"
                                      title="Redigera lokal variant"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                  {canDelete(v) && (
                                    <Button
                                      variant="ghost" size="icon"
                                      className="hidden sm:inline-flex rounded-full text-muted-foreground hover:text-destructive"
                                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(v); }}
                                      aria-label="Ta bort lokal variant"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                              {expanded === v.id && (
                                <div className="border-t border-border/60 px-5 py-4 space-y-3">
                                  {v.description && <p className="text-sm text-muted-foreground">{v.description}</p>}
                                  {(v.items?.length ?? 0) > 0 && (
                                    <div>
                                      <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Checkpoints</p>
                                      <ol className="space-y-2">
                                        {(v.items ?? []).sort((a, b) => a.sort_order - b.sort_order).map((item: ChecklistTemplateItem, idx: number) => (
                                          <li key={item.id} className="flex items-center gap-2.5 text-sm">
                                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">{idx + 1}</span>
                                            <span>{item.label}</span>
                                            {item.requires_photo && <Badge variant="secondary" className="text-xs">Foto krävs</Badge>}
                                          </li>
                                        ))}
                                      </ol>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* CREATE DIALOG */}
      <Dialog open={showCreate} onOpenChange={(o) => { setShowCreate(o); if (!o) setError(""); }}>
        <DialogContent className="max-h-[92dvh] w-full sm:max-w-4xl sm:max-h-[92vh] overflow-hidden p-0 gap-0">
          <DialogTitle className="sr-only">{createScope === "hk" ? "Ny HK-mall" : createScope === "forening" ? "Ny föreningsmall" : "Ny butiksmall"}</DialogTitle>
          <div className="flex items-center gap-3 border-b border-border/60 px-5 py-3.5">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">
              {createScope === "hk" ? "Ny HK-mall" : createScope === "forening" ? "Ny föreningsmall" : "Ny butiksmall"}
            </span>
            {form.title && <span className="text-sm font-semibold text-foreground truncate max-w-xs">{form.title}</span>}
            <div className="ml-auto flex items-center gap-2">
              {error && <span className="text-xs text-destructive">{error}</span>}
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => setShowCreate(false)}>Avbryt</Button>
              <Button size="sm" className="rounded-full" onClick={createTemplate} disabled={saving}>
                {saving ? "Sparar..." : "Spara mall"}
              </Button>
            </div>
          </div>
          {renderFormContent(form, setForm, createScope)}
        </DialogContent>
      </Dialog>

      {/* EDIT DIALOG */}
      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
        <DialogContent className="max-h-[92dvh] w-full sm:max-w-4xl sm:max-h-[92vh] overflow-hidden p-0 gap-0">
          <DialogTitle className="sr-only">Redigera mall{editTarget ? `: ${editTarget.title}` : ""}</DialogTitle>
          <div className="flex items-center gap-3 border-b border-border/60 px-5 py-3.5">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">Redigera mall</span>
            <div className="ml-auto flex items-center gap-2">
              {error && <span className="text-xs text-destructive">{error}</span>}
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => setEditTarget(null)}>Avbryt</Button>
              <Button size="sm" className="rounded-full" onClick={saveEdit} disabled={saving}>
                {saving ? "Sparar..." : "Spara ändringar"}
              </Button>
            </div>
          </div>
          {editTarget && renderFormContent(editForm, setEditForm, (editTarget.hierarchy_scope as "store" | "hk" | "forening") ?? "store")}
        </DialogContent>
      </Dialog>

      {/* BROADCAST CONFIRM */}
      <AlertDialog open={!!broadcastConfirm} onOpenChange={(o) => !o && setBroadcastConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Skicka till alla butiker</AlertDialogTitle>
            <AlertDialogDescription>
              Denna mall blir synlig i <strong>{allStores.length} butiker</strong>. Vill du fortsätta?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (broadcastConfirm === "create") setForm((p) => ({ ...p, storeIds: allStores.map((s) => s.id) }));
              else setEditForm((p) => ({ ...p, storeIds: allStores.map((s) => s.id) }));
              setBroadcastConfirm(null);
            }}>
              Skicka till alla
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* BULK DELETE CONFIRM */}
      <AlertDialog open={bulkDeleteTemplatesOpen} onOpenChange={setBulkDeleteTemplatesOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort {selectedTemplateIds.size} mallar</AlertDialogTitle>
            <AlertDialogDescription>
              Är du säker? Alla markerade mallar och deras steg och frågor raderas permanent.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={bulkDeleteTemplates}>
              Ta bort alla
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* DELETE CONFIRM */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort mall</AlertDialogTitle>
            <AlertDialogDescription>
              Är du säker på att du vill ta bort <strong>{deleteTarget?.title}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          {(() => {
            if (!deleteTarget) return null;
            const dependents = templates.filter(t =>
              ((t as ChecklistTemplate & { depends_on_template_title?: string }).depends_on_template_title ?? "").toLowerCase() === deleteTarget.title.toLowerCase()
            );
            if (dependents.length === 0) return null;
            return (
              <div className="mx-6 -mt-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-1">
                <p className="text-sm font-medium text-destructive">Varning: Följande mallar beror på den här:</p>
                <ul className="text-sm text-destructive/80 list-disc pl-4">
                  {dependents.map(d => <li key={d.id}>{d.title}</li>)}
                </ul>
                <p className="text-xs text-destructive/70">Ta bort eller uppdatera dessa mallar först.</p>
              </div>
            );
          })()}
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={deleteTemplate}>
              Ta bort
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* MERGE DIALOG */}
      <AlertDialog open={!!mergeTarget} onOpenChange={(o) => !o && setMergeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Synka med central mall</AlertDialogTitle>
            <AlertDialogDescription>
              Den centrala mallen <strong>{mergeTarget?.parent.title}</strong> har uppdaterats sedan din lokala variant skapades. Vill du ersätta din variants innehåll (titel, beskrivning, checkpoints och frågor) med den senaste versionen från den centrala mallen?
              <br /><br />
              <span className="text-amber-600 dark:text-amber-400 font-medium">Dina egna ändringar i varianten skrivs över.</span> Butikstilldelning och historik bevaras.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={merging}>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              disabled={merging}
              onClick={() => mergeTarget && void mergeFromParent(mergeTarget.variant, mergeTarget.parent)}
            >
              {merging ? "Synkar..." : "Synka nu"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* VERSION HISTORY DIALOG */}
      <Dialog open={!!versionHistoryTarget} onOpenChange={(o) => !o && setVersionHistoryTarget(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col p-0 gap-0">
          <DialogTitle className="sr-only">Versionshistorik</DialogTitle>
          <div className="flex items-center gap-3 border-b border-border/60 px-5 py-3.5">
            <History className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Versionshistorik</span>
            <span className="text-sm text-muted-foreground truncate flex-1">{versionHistoryTarget?.title}</span>
            <span className="text-xs text-muted-foreground whitespace-nowrap">v{versionHistoryTarget?.version ?? 1}</span>
            <button
              onClick={() => setVersionHistoryTarget(null)}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted/60 transition-colors"
              aria-label="Stäng"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 pb-8">
            {loadingVersions ? (
              <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />)}</div>
            ) : versions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Ingen versionshistorik tillgänglig än.</p>
            ) : (
              <div className="space-y-3">
                {versions.map((v, vIdx) => {
                  type SnapType = {
                    title?: string; description?: string; category?: string;
                    items?: { label: string }[]; questions?: { label: string; is_required?: boolean }[];
                    priority?: string; status?: string;
                    template_type?: string; template_mode?: string; is_critical?: boolean;
                    recurrence_rule?: string; recurrence_days?: number[]; recurrence_interval?: number;
                    recurrence_start?: string; recurrence_end?: string;
                    due_date_offset?: string | number; due_date_time?: string;
                    sap_article_id?: string; time_slots?: string[];
                    is_delivery_task?: boolean; delivery_flow_name?: string;
                    delivery_supplier_name?: string; delivery_entry_keys?: string;
                    event_trigger_description?: string;
                    depends_on_template_title?: string;
                    review_interval_months?: number;
                  };
                  const snap = v.snapshot as SnapType;
                  const prev = vIdx < versions.length - 1 ? versions[vIdx + 1].snapshot as SnapType : null;
                  const diffs: string[] = [];
                  if (prev) {
                    if (snap.title !== prev.title) diffs.push(`Titel: "${prev.title}" → "${snap.title}"`);
                    if (snap.description !== prev.description) diffs.push("Beskrivning ändrad");
                    if (snap.category !== prev.category) diffs.push(`Kategori: ${prev.category || "–"} → ${snap.category || "–"}`);
                    if (snap.priority !== prev.priority) diffs.push(`Prioritet: ${prev.priority ?? "–"} → ${snap.priority ?? "–"}`);
                    if (snap.status !== prev.status) diffs.push(`Status: ${prev.status ?? "–"} → ${snap.status ?? "–"}`);
                    if (snap.template_type !== prev.template_type) diffs.push(`Malltyp: ${prev.template_type ?? "–"} → ${snap.template_type ?? "–"}`);
                    if (snap.template_mode !== prev.template_mode) diffs.push(`Läge: ${prev.template_mode ?? "–"} → ${snap.template_mode ?? "–"}`);
                    if (snap.is_critical !== prev.is_critical) diffs.push(`Kritisk: ${prev.is_critical ? "Ja" : "Nej"} → ${snap.is_critical ? "Ja" : "Nej"}`);
                    if (snap.recurrence_rule !== prev.recurrence_rule) diffs.push(`Upprepning: ${prev.recurrence_rule || "Ingen"} → ${snap.recurrence_rule || "Ingen"}`);
                    if (JSON.stringify(snap.recurrence_days) !== JSON.stringify(prev.recurrence_days)) diffs.push(`Upprepningsdagar ändrade`);
                    if (snap.recurrence_interval !== prev.recurrence_interval) diffs.push(`Upprepningsintervall: ${prev.recurrence_interval ?? 1} → ${snap.recurrence_interval ?? 1}`);
                    if (snap.recurrence_start !== prev.recurrence_start) diffs.push(`Startdatum: ${prev.recurrence_start || "–"} → ${snap.recurrence_start || "–"}`);
                    if (snap.recurrence_end !== prev.recurrence_end) diffs.push(`Slutdatum: ${prev.recurrence_end || "–"} → ${snap.recurrence_end || "–"}`);
                    if (String(snap.due_date_offset ?? "") !== String(prev.due_date_offset ?? "")) diffs.push(`Förfallsoffset: ${prev.due_date_offset || "–"} → ${snap.due_date_offset || "–"}`);
                    if (snap.due_date_time !== prev.due_date_time) diffs.push(`Förfallotid: ${prev.due_date_time || "–"} → ${snap.due_date_time || "–"}`);
                    if (snap.sap_article_id !== prev.sap_article_id) diffs.push(`SAP-artikel: ${prev.sap_article_id || "–"} → ${snap.sap_article_id || "–"}`);
                    if (JSON.stringify(snap.time_slots) !== JSON.stringify(prev.time_slots)) diffs.push(`Tidsluckor ändrade`);
                    if (snap.is_delivery_task !== prev.is_delivery_task) diffs.push(`Leveransmall: ${prev.is_delivery_task ? "Ja" : "Nej"} → ${snap.is_delivery_task ? "Ja" : "Nej"}`);
                    if (snap.delivery_supplier_name !== prev.delivery_supplier_name) diffs.push(`Leverantör: ${prev.delivery_supplier_name || "–"} → ${snap.delivery_supplier_name || "–"}`);
                    if (snap.delivery_flow_name !== prev.delivery_flow_name) diffs.push(`Flöde: ${prev.delivery_flow_name || "–"} → ${snap.delivery_flow_name || "–"}`);
                    if (snap.delivery_entry_keys !== prev.delivery_entry_keys) diffs.push(`Leveransnyckel ändrad`);
                    if (snap.event_trigger_description !== prev.event_trigger_description) diffs.push(`Händelseutlösare: ${prev.event_trigger_description || "–"} → ${snap.event_trigger_description || "–"}`);
                    if (snap.depends_on_template_title !== prev.depends_on_template_title) diffs.push(`Beroende av: ${prev.depends_on_template_title || "Ingen"} → ${snap.depends_on_template_title || "Ingen"}`);
                    if (snap.review_interval_months !== prev.review_interval_months) diffs.push(`Granskningsintervall: ${prev.review_interval_months ?? "–"} mån → ${snap.review_interval_months ?? "–"} mån`);
                    // Detailed step diff
                    const prevLabels = (prev.items ?? []).map(it => it.label);
                    const snapLabels = (snap.items ?? []).map(it => it.label);
                    const addedSteps = snapLabels.filter(l => !prevLabels.includes(l));
                    const removedSteps = prevLabels.filter(l => !snapLabels.includes(l));
                    addedSteps.forEach(l => diffs.push(`+ Steg: "${l}"`));
                    removedSteps.forEach(l => diffs.push(`- Steg: "${l}"`));
                    if (addedSteps.length === 0 && removedSteps.length === 0 && prevLabels.length !== snapLabels.length) {
                      diffs.push(`Steg omordnade: ${prevLabels.length} → ${snapLabels.length}`);
                    }
                    // Detailed question diff
                    const prevQLabels = (prev.questions ?? []).map(q => q.label);
                    const snapQLabels = (snap.questions ?? []).map(q => q.label);
                    const addedQs = snapQLabels.filter(l => !prevQLabels.includes(l));
                    const removedQs = prevQLabels.filter(l => !snapQLabels.includes(l));
                    addedQs.forEach(l => diffs.push(`+ Fråga: "${l}"`));
                    removedQs.forEach(l => diffs.push(`- Fråga: "${l}"`));
                  }
                  return (
                    <div key={v.id} className="rounded-xl border border-border/60 bg-card p-3 space-y-2">
                      <div className="flex items-start gap-3">
                        <div className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                          v.version === (versionHistoryTarget?.version ?? 1) ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
                        )}>
                          v{v.version}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground">{v.change_summary || "Sparad"}</p>
                          <p className="text-[11px] text-muted-foreground">{new Date(v.saved_at).toLocaleString("sv-SE")}</p>
                          {snap.title && (
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              "{snap.title}" — {snap.items?.length ?? 0} steg, {snap.questions?.length ?? 0} frågor
                              {snap.recurrence_rule ? `, ${snap.recurrence_rule}` : ""}
                              {snap.is_delivery_task ? ", leveransmall" : ""}
                              {snap.is_critical ? ", kritisk" : ""}
                            </p>
                          )}
                        </div>
                        {isManager && v.version !== (versionHistoryTarget?.version ?? 1) && (
                          <Button variant="outline" size="sm" className="rounded-full h-7 text-xs shrink-0" onClick={() => setRestoreConfirm(v)}>
                            Återställ
                          </Button>
                        )}
                      </div>
                      {diffs.length > 0 ? (
                        <div className="rounded-lg bg-muted/40 border border-border/40 overflow-hidden">
                          {diffs.map((d, i) => {
                            const isAdded = d.startsWith("+ ");
                            const isRemoved = d.startsWith("- ");
                            return (
                              <div
                                key={i}
                                className={cn(
                                  "flex items-start gap-2 px-3 py-1.5 text-xs font-mono border-b border-border/20 last:border-0",
                                  isAdded && "bg-success/8 text-success-foreground",
                                  isRemoved && "bg-destructive/8 text-destructive",
                                  !isAdded && !isRemoved && "text-foreground/70"
                                )}
                              >
                                <span className={cn(
                                  "shrink-0 w-3 font-bold",
                                  isAdded && "text-success",
                                  isRemoved && "text-destructive",
                                  !isAdded && !isRemoved && "text-muted-foreground"
                                )}>
                                  {isAdded ? "+" : isRemoved ? "−" : "·"}
                                </span>
                                <span className="break-words min-w-0">{isAdded ? d.slice(2) : isRemoved ? d.slice(2) : d}</span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">Inga spårade ändringar</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* RESTORE VERSION CONFIRM */}
      <AlertDialog open={!!restoreConfirm} onOpenChange={(o) => !o && setRestoreConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Återställ version {restoreConfirm?.version}</AlertDialogTitle>
            <AlertDialogDescription>
              En ny version skapas med innehållet från version {restoreConfirm?.version}. Nuvarande version bevaras i historiken.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={() => restoreConfirm && void restoreVersion(restoreConfirm)}>
              Återställ
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* COPY / VARIANT DIALOG */}
      <Dialog open={!!inheritTarget} onOpenChange={(o) => !o && setInheritTarget(null)}>
        <DialogContent className="max-w-md">
          <div className="space-y-4 p-4">
            <h2 className="text-base font-semibold">Kopiera mall: {inheritTarget?.title}</h2>
            <p className="text-sm text-muted-foreground">Välj hur du vill använda den här mallen som utgångspunkt:</p>

            <div className="space-y-2">
              <button
                className={cn(
                  "w-full rounded-xl border p-3 text-left transition-colors",
                  inheritMode === "copy" ? "border-primary bg-primary/5" : "border-border/60 hover:border-primary/40"
                )}
                onClick={() => setInheritMode("copy")}
              >
                <div className="flex items-center gap-2">
                  <Copy className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Kopiera mall</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Fristående kopia — ändringar i originalet påverkar inte kopian.</p>
              </button>

              <button
                className={cn(
                  "w-full rounded-xl border p-3 text-left transition-colors",
                  inheritMode === "variant" ? "border-primary bg-primary/5" : "border-border/60 hover:border-primary/40"
                )}
                onClick={() => setInheritMode("variant")}
              >
                <div className="flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Skapa lokal variant</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Behåller koppling — du kan lägga till steg, dölja steg och skriva över beskrivningar.</p>
              </button>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setInheritTarget(null)}>Avbryt</Button>
              <Button onClick={() => inheritTarget && void createInheritedTemplate(inheritTarget, inheritMode)}>
                <Layers className="mr-2 h-4 w-4" />
                {inheritMode === "copy" ? "Skapa kopia" : "Skapa variant"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* TEMPLATE PREVIEW DIALOG */}
      <Dialog open={!!previewTarget} onOpenChange={(o) => !o && setPreviewTarget(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col p-0 gap-0">
          <DialogTitle className="sr-only">Förhandsgranska mall</DialogTitle>
          <div className="flex items-center gap-3 border-b border-border/60 px-5 py-3.5">
            <Eye className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Förhandsgranska mall</span>
            <span className="text-sm text-foreground font-semibold truncate flex-1">{previewTarget?.title}</span>
            <button
              onClick={() => setPreviewTarget(null)}
              className="ml-auto flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted/60 transition-colors"
              aria-label="Stäng"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {previewTarget && (
            <div className="flex-1 overflow-y-auto p-6 space-y-6 pb-10">
              {/* Meta badges */}
              <div className="flex flex-wrap gap-2">
                {previewTarget.category && <Badge variant="secondary">{previewTarget.category}</Badge>}
                <Badge variant="outline" className={cn("text-xs", (TEMPLATE_STATUS_OPTIONS.find(o => o.value === (previewTarget.status ?? "active")) ?? TEMPLATE_STATUS_OPTIONS[0]).cls)}>
                  {(TEMPLATE_STATUS_OPTIONS.find(o => o.value === (previewTarget.status ?? "active")) ?? TEMPLATE_STATUS_OPTIONS[0]).label}
                </Badge>
                {previewTarget.priority && <Badge variant="outline">{previewTarget.priority}</Badge>}
                {previewTarget.recurrence_rule && (
                  <Badge variant="outline" className="gap-1">
                    <Repeat className="h-3 w-3" />
                    {RECURRENCE_OPTIONS.find(o => o.value === previewTarget.recurrence_rule)?.label ?? previewTarget.recurrence_rule}
                  </Badge>
                )}
                {previewTarget.due_date_time && (
                  <Badge variant="outline" className="gap-1">
                    <Clock className="h-3 w-3" /> Förfaller {previewTarget.due_date_time}
                  </Badge>
                )}
                {(() => {
                  const ts = (previewTarget as ChecklistTemplate & { time_slots?: string[] }).time_slots;
                  return ts && ts.length > 0 ? (
                    <Badge variant="outline" className="gap-1">
                      <CalendarClock className="h-3 w-3" /> {ts.length} tidsluckor
                    </Badge>
                  ) : null;
                })()}
              </div>

              {previewTarget.description && (
                <p className="text-sm text-muted-foreground leading-relaxed">{previewTarget.description}</p>
              )}

              {/* Steps */}
              {(previewTarget.items?.length ?? 0) > 0 && (
                <div>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Steg ({previewTarget.items?.length})</p>
                  <ol className="space-y-2">
                    {(previewTarget.items ?? []).sort((a, b) => a.sort_order - b.sort_order).map((item: ChecklistTemplateItem, idx: number) => (
                      <li key={item.id} className="flex items-center gap-3 rounded-xl border border-border/50 bg-muted/20 px-3 py-2.5">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">{idx + 1}</span>
                        <span className="flex-1 text-sm">{item.label}</span>
                        {item.requires_photo && <Badge variant="secondary" className="text-xs">Foto krävs</Badge>}
                        {(item as ChecklistTemplateItem & { link_url?: string }).link_url && (
                          <a href={(item as ChecklistTemplateItem & { link_url?: string }).link_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/20 transition-colors">
                            <ExternalLink className="h-3 w-3" />Länk
                          </a>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Questions */}
              {(previewTarget.questions?.length ?? 0) > 0 && (
                <div>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Frågor ({previewTarget.questions?.length})</p>
                  <ol className="space-y-2">
                    {(previewTarget.questions ?? []).sort((a, b) => a.sort_order - b.sort_order).map((q: ChecklistTemplateQuestion, idx: number) => (
                      <li key={q.id} className="flex items-center gap-3 rounded-xl border border-border/50 bg-muted/20 px-3 py-2.5">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">{idx + 1}</span>
                        <span className="flex-1 text-sm">{q.label}</span>
                        {q.question_type === "yes_no" && <Badge variant="secondary" className="text-xs">Ja/Nej</Badge>}
                        {q.is_required && <Badge variant="outline" className="text-xs text-destructive border-destructive/30">Obligatorisk</Badge>}
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Time slots */}
              {(() => {
                const ts = (previewTarget as ChecklistTemplate & { time_slots?: string[] }).time_slots;
                return ts && ts.length > 0 ? (
                  <div>
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tidsluckor</p>
                    <div className="flex flex-wrap gap-2">
                      {ts.map((slot, i) => (
                        <div key={i} className="flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/30 px-3 py-1.5 text-sm">
                          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                          {slot}
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">En uppgift skapas per tidslucka och period.</p>
                  </div>
                ) : null;
              })()}

              {/* Inheritance info */}
              {previewTarget.parent_template_id && (
                <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <GitBranch className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{previewTarget.inherit_mode === "variant" ? "Lokal variant" : "Kopia"}</span>
                    <span className="text-muted-foreground">av en överordnad mall</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* BULK TASK CREATION WIZARD */}
      <Dialog open={bulkCreateOpen} onOpenChange={(o) => !o && setBulkCreateOpen(false)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
          <DialogTitle className="sr-only">Skapa uppgifter från mallar</DialogTitle>
          <div className="flex items-center gap-3 border-b border-border/60 px-5 py-3.5">
            <ListChecks className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Skapa uppgifter från {bulkTaskConfigs.length} mallar</span>
            <span className="text-xs text-muted-foreground">
              ({bulkTaskConfigs.reduce((sum, cfg) => {
                const tmpl = templates.find(t => t.id === cfg.templateId);
                const slots = (tmpl as ChecklistTemplate & { time_slots?: string[] })?.time_slots ?? [];
                return sum + Math.max(1, slots.length);
              }, 0)} uppgifter totalt)
            </span>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => setBulkCreateOpen(false)}>Avbryt</Button>
              <Button size="sm" className="rounded-full" onClick={bulkCreateTasks} disabled={bulkCreating}>
                {bulkCreating ? "Skapar..." : `Skapa uppgifter`}
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-4 pb-8">
            <p className="text-sm text-muted-foreground">Förfallodatum, tid och prioritet hämtas direkt från mallen. Välj vem som ska tilldelas varje uppgift.</p>
            {bulkTaskConfigs.map((cfg, idx) => {
              const tmpl = templates.find(t => t.id === cfg.templateId);
              if (!tmpl) return null;
              const isDeliveryTmpl = !!(tmpl as ChecklistTemplate & { is_delivery_task?: boolean }).is_delivery_task;
              const timeSlots = (tmpl as ChecklistTemplate & { time_slots?: string[] })?.time_slots ?? [];
              const taskCount = Math.max(1, timeSlots.length);
              const storeUsers = allUsers.filter(u => !activeStore || u.store_id === activeStore.id);
              const storeGroups = allGroups.filter(g => !activeStore || g.store_id === activeStore.id);
              const smartDate = calcNextDueDate(tmpl);
              return (
                <div key={cfg.templateId} className={cn("rounded-2xl border bg-card p-4 space-y-4", isDeliveryTmpl ? "border-amber-300/60 bg-amber-50/30" : "border-border/60")}>
                  <div className="flex items-start gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{idx + 1}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{tmpl.title}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {tmpl.category && <Badge variant="secondary" className="text-xs">{tmpl.category}</Badge>}
                        <Badge variant="outline" className="text-xs">{tmpl.priority ?? "Medel"}</Badge>
                        <span className="text-xs text-muted-foreground">{tmpl.items?.length ?? 0} steg</span>
                        {taskCount > 1 && <Badge className="text-xs bg-primary/10 text-primary border-0">{taskCount} uppgifter (tidsluckor)</Badge>}
                        {isDeliveryTmpl && <Badge variant="outline" className="text-xs border-amber-400 text-amber-700 bg-amber-50"><Truck className="h-3 w-3 mr-1" />Leveransmall</Badge>}
                        {(() => {
                          const depTitle = (tmpl as ChecklistTemplate & { depends_on_template_title?: string }).depends_on_template_title;
                          if (!depTitle) return null;
                          const inBatch = bulkTaskConfigs.some(c => {
                            const t = templates.find(x => x.id === c.templateId);
                            return t && t.title.toLowerCase() === depTitle.toLowerCase();
                          });
                          // Check if a matching task already exists (we can't query here, but show "okänd" if not in batch)
                          const status = inBatch ? "batch" : "extern";
                          return (
                            <Badge variant="outline" className={cn(
                              "text-xs gap-1",
                              status === "batch" ? "border-green-400 text-green-700 bg-green-50" :
                              "border-orange-400 text-orange-700 bg-orange-50"
                            )}>
                              <Link2 className="h-3 w-3" />
                              Beror på: {depTitle}
                              {status === "batch" ? " (i batch)" : " — måste finnas i batch!"}
                            </Badge>
                          );
                        })()}
                      </div>
                      {/* Smart date info */}
                      {!isDeliveryTmpl && (
                        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                          {tmpl.recurrence_rule && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5">
                              <Repeat className="h-3 w-3" />
                              {RECURRENCE_OPTIONS.find(r => r.value === tmpl.recurrence_rule)?.label ?? tmpl.recurrence_rule}
                            </span>
                          )}
                          {smartDate && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5">
                              <Clock className="h-3 w-3" />
                              Nästa: {smartDate.iso}{smartDate.time ? ` kl ${smartDate.time}` : ""}
                            </span>
                          )}
                          {timeSlots.length > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5">
                              <Clock className="h-3 w-3" />
                              {timeSlots.join(" · ")}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Delivery template: pick specific deliveries from the current week's plan */}
                  {isDeliveryTmpl && (() => {
                    const tmplEntryKeys = ((tmpl as ChecklistTemplate & { delivery_entry_keys?: string }).delivery_entry_keys ?? "")
                      .split("|").map(s => s.trim()).filter(s => s.includes("||"));
                    const tmplFlows = ((tmpl as ChecklistTemplate & { delivery_flow_name?: string }).delivery_flow_name ?? "")
                      .split("|").map(s => s.trim().toLowerCase()).filter(Boolean);
                    const tmplSuppliers = ((tmpl as ChecklistTemplate & { delivery_supplier_name?: string }).delivery_supplier_name ?? "")
                      .split("|").map(s => s.trim().toLowerCase()).filter(Boolean);

                    // An entry is "suggested" (pre-checked) if it matches the template config:
                    // prefer precise key match, fall back to supplier+flow
                    const isSuggested = (e: { delivery_day: string; supplier: string; flow_name: string }) => {
                      if (tmplEntryKeys.length > 0) {
                        return tmplEntryKeys.includes(`${e.delivery_day}||${e.supplier?.trim()}||${e.flow_name?.trim()}`);
                      }
                      const flowOk = tmplFlows.length === 0 || tmplFlows.includes(e.flow_name?.toLowerCase() ?? "");
                      const suppOk = tmplSuppliers.length === 0 || tmplSuppliers.includes(e.supplier?.toLowerCase() ?? "");
                      return flowOk && suppOk;
                    };
                    const hasSuggestions = tmplEntryKeys.length > 0 || tmplFlows.length > 0 || tmplSuppliers.length > 0;

                    // Group by delivery_day — day and time are key info for deliveries
                    const dayOrder = ["Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag", "Söndag"];
                    const byDay = deliveryWeekEntries.reduce<Record<string, typeof deliveryWeekEntries>>((acc, e) => {
                      const k = e.delivery_day || "Okänd dag";
                      if (!acc[k]) acc[k] = [];
                      acc[k].push(e);
                      return acc;
                    }, {});
                    const sortedDays = Object.keys(byDay).sort((a, b) => {
                      const ai = dayOrder.indexOf(a);
                      const bi = dayOrder.indexOf(b);
                      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
                    });

                    return (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                            <label className="text-xs font-medium text-muted-foreground">Välj leveranser (veckans plan)</label>
                            {hasSuggestions && (
                              <span className="text-[10px] text-blue-600 bg-blue-50 rounded-full px-2 py-0.5">Förvalda markerade</span>
                            )}
                          </div>
                          {deliveryWeekEntries.length > 1 && (
                            <button
                              type="button"
                              className="text-[11px] text-primary hover:underline"
                              onClick={() => {
                                const allIds = deliveryWeekEntries.map(s => s.id);
                                const allSelected = allIds.every(id => cfg.selectedDeliveryIds.includes(id));
                                const ids = allSelected ? [] : allIds;
                                setBulkTaskConfigs(prev => prev.map((c, i) => i === idx ? { ...c, selectedDeliveryIds: ids } : c));
                              }}
                            >
                              {deliveryWeekEntries.every(s => cfg.selectedDeliveryIds.includes(s.id)) ? "Avmarkera alla" : "Välj alla"}
                            </button>
                          )}
                        </div>
                        {deliveryWeekEntries.length === 0 ? (
                          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                            Ingen aktiv leveransplan hittades. Importera en leveransplan under Inställningar.
                          </p>
                        ) : (
                          <div className="space-y-1.5 max-h-56 overflow-y-auto rounded-lg border border-border/50 p-2">
                            {sortedDays.map(dayName => {
                              const entries = byDay[dayName];
                              const dayIds = entries.map(e => e.id);
                              const allDaySelected = dayIds.every(id => cfg.selectedDeliveryIds.includes(id));
                              const someDaySelected = dayIds.some(id => cfg.selectedDeliveryIds.includes(id));
                              return (
                                <div key={dayName} className="space-y-0.5">
                                  <label className="flex cursor-pointer items-center gap-2.5 rounded px-1.5 py-1.5 bg-muted/30 hover:bg-muted/50">
                                    <Checkbox
                                      checked={allDaySelected}
                                      data-state={someDaySelected && !allDaySelected ? "indeterminate" : undefined}
                                      onCheckedChange={() => {
                                        const ids = allDaySelected
                                          ? cfg.selectedDeliveryIds.filter(id => !dayIds.includes(id))
                                          : [...new Set([...cfg.selectedDeliveryIds, ...dayIds])];
                                        setBulkTaskConfigs(prev => prev.map((c, i) => i === idx ? { ...c, selectedDeliveryIds: ids } : c));
                                      }}
                                      className="h-3.5 w-3.5"
                                    />
                                    <span className="text-xs font-semibold flex-1">{dayName}</span>
                                    <span className="text-[10px] text-muted-foreground">{entries.length} leverans{entries.length !== 1 ? "er" : ""}</span>
                                  </label>
                                  {entries.map(e => {
                                    const suggested = isSuggested(e);
                                    return (
                                      <label key={e.id} className={cn(
                                        "flex cursor-pointer items-center gap-2.5 rounded px-1.5 py-1.5 pl-6 hover:bg-muted/50",
                                        suggested && hasSuggestions && "bg-blue-50/50"
                                      )}>
                                        <Checkbox
                                          checked={cfg.selectedDeliveryIds.includes(e.id)}
                                          onCheckedChange={(checked) => {
                                            const ids = checked
                                              ? [...cfg.selectedDeliveryIds, e.id]
                                              : cfg.selectedDeliveryIds.filter(id => id !== e.id);
                                            setBulkTaskConfigs(prev => prev.map((c, i) => i === idx ? { ...c, selectedDeliveryIds: ids } : c));
                                          }}
                                          className="h-3.5 w-3.5"
                                        />
                                        <div className="flex-1 min-w-0">
                                          <span className="text-xs">{e.supplier}</span>
                                          <span className="text-[10px] text-muted-foreground ml-1.5">{e.flow_name}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                          {e.delivery_time && (
                                            <span className="text-[11px] font-medium text-foreground/70 tabular-nums">{e.delivery_time}</span>
                                          )}
                                          {suggested && hasSuggestions && (
                                            <span className="text-[10px] text-blue-600">●</span>
                                          )}
                                        </div>
                                      </label>
                                    );
                                  })}
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {cfg.selectedDeliveryIds.length > 0 && (
                          <p className="text-[11px] text-muted-foreground">{cfg.selectedDeliveryIds.length} leverans{cfg.selectedDeliveryIds.length !== 1 ? "er" : ""} valda — skapar {cfg.selectedDeliveryIds.length} uppgift{cfg.selectedDeliveryIds.length !== 1 ? "er" : ""}</p>
                        )}
                      </div>
                    );
                  })()}

                  {/* Assignees */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Users className="h-3.5 w-3.5 text-muted-foreground" />
                      <label className="text-xs font-medium text-muted-foreground">Tilldelad</label>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <p className="text-[11px] text-muted-foreground/70 mb-1.5">Användare</p>
                        <div className="space-y-0.5 max-h-28 overflow-y-auto rounded-lg border border-border/50 p-2">
                          {storeUsers.length === 0 ? (
                            <p className="text-xs text-muted-foreground py-1">Inga användare</p>
                          ) : storeUsers.map(u => (
                            <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-muted/50">
                              <Checkbox
                                checked={cfg.assigneeUserIds.includes(u.id)}
                                onCheckedChange={(checked) => {
                                  const ids = checked
                                    ? [...cfg.assigneeUserIds, u.id]
                                    : cfg.assigneeUserIds.filter(id => id !== u.id);
                                  setBulkTaskConfigs(prev => prev.map((c, i) => i === idx ? { ...c, assigneeUserIds: ids } : c));
                                }}
                                className="h-3.5 w-3.5"
                              />
                              <span className="text-xs">{u.display_name}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-[11px] text-muted-foreground/70 mb-1.5">Grupper</p>
                        <div className="space-y-0.5 max-h-28 overflow-y-auto rounded-lg border border-border/50 p-2">
                          {storeGroups.length === 0 ? (
                            <p className="text-xs text-muted-foreground py-1">Inga grupper</p>
                          ) : storeGroups.map(g => (
                            <label key={g.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-muted/50">
                              <Checkbox
                                checked={cfg.assigneeGroupIds.includes(g.id)}
                                onCheckedChange={(checked) => {
                                  const ids = checked
                                    ? [...cfg.assigneeGroupIds, g.id]
                                    : cfg.assigneeGroupIds.filter(id => id !== g.id);
                                  setBulkTaskConfigs(prev => prev.map((c, i) => i === idx ? { ...c, assigneeGroupIds: ids } : c));
                                }}
                                className="h-3.5 w-3.5"
                              />
                              <span className="text-xs">{g.name}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Händelsevillkor bekräftare — only when template has event trigger */}
                  {(tmpl as ChecklistTemplate & { event_trigger_description?: string }).event_trigger_description && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Zap className="h-3.5 w-3.5 text-amber-500" />
                        <label className="text-xs font-medium text-muted-foreground">
                          Bekräftare för: <span className="text-foreground font-semibold">{(tmpl as ChecklistTemplate & { event_trigger_description?: string }).event_trigger_description}</span>
                        </label>
                      </div>
                      <p className="text-[11px] text-muted-foreground">Välj vem som ska bekräfta att händelsen inträffat innan uppgiften visas.</p>
                      <div className="space-y-0.5 max-h-28 overflow-y-auto rounded-lg border border-amber-200 bg-amber-50/30 p-2">
                        <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-muted/50">
                          <Checkbox
                            checked={cfg.eventTriggerUserId === ""}
                            onCheckedChange={() => setBulkTaskConfigs(prev => prev.map((c, i) => i === idx ? { ...c, eventTriggerUserId: "" } : c))}
                            className="h-3.5 w-3.5"
                          />
                          <span className="text-xs text-muted-foreground italic">Ingen specifik bekräftare</span>
                        </label>
                        {storeUsers.map(u => (
                          <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-muted/50">
                            <Checkbox
                              checked={cfg.eventTriggerUserId === u.id}
                              onCheckedChange={(checked) => {
                                setBulkTaskConfigs(prev => prev.map((c, i) => i === idx ? { ...c, eventTriggerUserId: checked ? u.id : "" } : c));
                              }}
                              className="h-3.5 w-3.5"
                            />
                            <span className="text-xs">{u.display_name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* TEMPLATE PACKAGES PANEL */}
      <Dialog open={showPackagesPanel} onOpenChange={(o) => { if (!o) { setShowPackagesPanel(false); setEditPackageTarget(null); setPackageForm({ name: "", description: "" }); setPackageTemplateIds([]); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
          <DialogTitle className="sr-only">Mallpaket</DialogTitle>
          <div className="flex items-center gap-3 border-b border-border/60 px-5 py-3.5">
            <Layers className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Mallpaket</span>
            <span className="text-xs text-muted-foreground ml-1">— gruppera mallar och skapa alla uppgifter på en gång</span>
            <button
              onClick={() => setShowPackagesPanel(false)}
              className="ml-auto flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted/60 transition-colors"
              aria-label="Stäng"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-6 pb-10">
            {/* Create / Edit form — only admins and HK users can manage packages */}
            {(isAdmin || isHK) && (
            <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
              <h3 className="text-sm font-semibold">{editPackageTarget ? "Redigera paket" : "Skapa nytt paket"}</h3>
              <Input
                placeholder="Paketnamn"
                value={packageForm.name}
                onChange={(e) => setPackageForm(p => ({ ...p, name: e.target.value }))}
                className="h-8 text-sm"
              />
              <Input
                placeholder="Beskrivning (valfritt)"
                value={packageForm.description}
                onChange={(e) => setPackageForm(p => ({ ...p, description: e.target.value }))}
                className="h-8 text-sm"
              />
              <div>
                <p className="text-xs text-muted-foreground mb-2">Välj mallar att inkludera:</p>
                <div className="space-y-1 max-h-48 overflow-y-auto rounded-lg border border-border/50 p-2">
                  {templates.map(t => (
                    <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1.5 hover:bg-muted/50">
                      <Checkbox
                        checked={packageTemplateIds.includes(t.id)}
                        onCheckedChange={(checked) => {
                          setPackageTemplateIds(prev => checked ? [...prev, t.id] : prev.filter(id => id !== t.id));
                        }}
                        className="h-3.5 w-3.5"
                      />
                      <span className="text-xs flex-1">{t.title}</span>
                      {t.category && <Badge variant="secondary" className="text-[10px]">{t.category}</Badge>}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2">
                {editPackageTarget && (
                  <Button variant="ghost" size="sm" className="text-xs" onClick={() => { setEditPackageTarget(null); setPackageForm({ name: "", description: "" }); setPackageTemplateIds([]); }}>
                    Avbryt
                  </Button>
                )}
                <Button size="sm" className="rounded-full text-xs" onClick={savePackage} disabled={!packageForm.name.trim() || packageTemplateIds.length === 0}>
                  {editPackageTarget ? "Spara ändringar" : `Skapa paket (${packageTemplateIds.length} mallar)`}
                </Button>
              </div>
            </div>
            )} {/* end isAdmin || isHK create form */}

            {/* Existing packages */}
            {packages.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground">Sparade paket</h3>
                {packages.map(pkg => {
                  const pkgTemplates = (pkg.items ?? []).map(it => templates.find(t => t.id === it.template_id)).filter(Boolean) as TemplateWithMeta[];
                  return (
                    <div key={pkg.id} className="rounded-2xl border border-border/60 bg-card p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{pkg.name}</p>
                          {pkg.description && <p className="text-xs text-muted-foreground">{pkg.description}</p>}
                          <p className="text-xs text-muted-foreground mt-0.5">{pkgTemplates.length} mallar</p>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button
                            variant="outline" size="sm"
                            className="rounded-full h-7 text-xs"
                            onClick={() => { setActivatePackageTarget(pkg); setBulkTaskConfigs(pkgTemplates.map(t => { const tAny = t as ChecklistTemplate & { event_trigger_user_id?: string; delivery_flow_name?: string; delivery_supplier_name?: string; is_delivery_task?: boolean }; const tmplFlows = (tAny.delivery_flow_name ?? "").split("|").map(s => s.trim().toLowerCase()).filter(Boolean); const tmplSupps = (tAny.delivery_supplier_name ?? "").split("|").map(s => s.trim().toLowerCase()).filter(Boolean); const preIds = tAny.is_delivery_task ? deliverySuppliers.filter(s => (tmplFlows.length === 0 || tmplFlows.includes(s.flow_name?.toLowerCase() ?? "")) && (tmplSupps.length === 0 || tmplSupps.includes(s.supplier?.toLowerCase() ?? ""))).map(s => s.id) : []; return { templateId: t.id, assigneeUserIds: [], assigneeGroupIds: [], eventTriggerUserId: tAny.event_trigger_user_id ?? "", selectedDeliveryIds: preIds }; })); setShowPackagesPanel(false); setBulkCreateOpen(true); }}
                          >
                            <ListChecks className="h-3 w-3 mr-1" /> Aktivera
                          </Button>
                          {(isAdmin || isHK) && (
                          <>
                          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full text-muted-foreground hover:text-primary" onClick={() => openEditPackage(pkg)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full text-muted-foreground hover:text-destructive" onClick={() => deletePackage(pkg)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                          </>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {pkgTemplates.map(t => (
                          <Badge key={t.id} variant="secondary" className="text-xs">{t.title}</Badge>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Review Dialog */}
      <Dialog open={!!reviewTarget} onOpenChange={(o) => { if (!o) { setReviewTarget(null); setReviewEndDate(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Granska mall</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">{reviewTarget?.title}</span>
              {reviewTarget && (() => {
                const created = new Date((reviewTarget as ChecklistTemplate & { created_at?: string }).created_at ?? "");
                const months = isNaN(created.getTime()) ? null : Math.round((Date.now() - created.getTime()) / (1000 * 60 * 60 * 24 * 30));
                return months != null ? ` — aktiv sedan ca ${months} månader` : "";
              })()}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Denna återkommande mall har nått granskningsdatumet. Välj vad som ska hända:
            </p>
            <button
              type="button"
              disabled={reviewSaving}
              onClick={() => handleReview("continue")}
              className="w-full rounded-lg border border-border px-4 py-3 text-left hover:bg-muted/50 transition-colors"
            >
              <span className="block text-sm font-medium">Fortsätt till nästa granskning</span>
              <span className="block text-xs text-muted-foreground mt-0.5">
                Mallen fortsätter som vanligt. Nästa granskning om {(reviewTarget as ChecklistTemplate & { review_interval_months?: number })?.review_interval_months ?? 24} månader.
              </span>
            </button>
            <button
              type="button"
              disabled={reviewSaving}
              onClick={() => handleReview("edit")}
              className="w-full rounded-lg border border-primary/30 px-4 py-3 text-left hover:bg-primary/5 transition-colors"
            >
              <span className="block text-sm font-medium">Redigera mall</span>
              <span className="block text-xs text-muted-foreground mt-0.5">Öppna mallen för redigering innan beslut fattas.</span>
            </button>
            <div className="rounded-lg border border-border px-4 py-3 space-y-2">
              <span className="block text-sm font-medium">Sätt slutdatum</span>
              <span className="block text-xs text-muted-foreground">Mallen slutar skapa uppgifter efter detta datum.</span>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={reviewEndDate}
                  onChange={(e) => setReviewEndDate(e.target.value)}
                  className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                />
                <button
                  type="button"
                  disabled={reviewSaving || !reviewEndDate}
                  onClick={() => handleReview("set_end_date")}
                  className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50 transition-opacity"
                >
                  Spara
                </button>
              </div>
            </div>
            {!(reviewTarget as ChecklistTemplate & { is_critical?: boolean })?.is_critical && (
              <button
                type="button"
                disabled={reviewSaving}
                onClick={() => handleReview("archive")}
                className="w-full rounded-lg border border-destructive/30 px-4 py-3 text-left hover:bg-destructive/5 transition-colors"
              >
                <span className="block text-sm font-medium text-destructive">Arkivera mall</span>
                <span className="block text-xs text-muted-foreground mt-0.5">Mallen arkiveras och skapar inga fler uppgifter.</span>
              </button>
            )}
            {(reviewTarget as ChecklistTemplate & { is_critical?: boolean })?.is_critical && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Kritisk rutin — kan inte arkiveras automatiskt.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* CSV delivery supplier mapping dialog */}
      <Dialog open={deliveryMappingOpen} onOpenChange={(o) => { if (!o) setDeliveryMappingOpen(false); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col p-0 gap-0">
          <DialogTitle className="sr-only">Koppla leveranser till mallar</DialogTitle>
          <div className="flex items-center gap-3 border-b border-border/60 px-5 py-3.5">
            <Truck className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Koppla leveranser till mallar</span>
          </div>
          <p className="px-5 pt-4 pb-2 text-xs text-muted-foreground">
            Välj vilka leveranser varje leveransmall ska kopplas till.
          </p>
          <div className="flex-1 overflow-y-auto px-5 space-y-5 pb-8">
            {deliveryMappingItems.map((item, idx) => {
              const dayOrder = ["Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag", "Söndag"];
              const byDay = deliveryWeekEntries.reduce<Record<string, typeof deliveryWeekEntries>>((acc, e) => {
                const k = e.delivery_day || "Okänd dag";
                if (!acc[k]) acc[k] = [];
                acc[k].push(e);
                return acc;
              }, {});
              const sortedDays = Object.keys(byDay).sort((a, b) => {
                const ai = dayOrder.indexOf(a); const bi = dayOrder.indexOf(b);
                return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
              });
              const selectedKeys = new Set(item.entryKeys);
              const entryKey = (e: typeof deliveryWeekEntries[0]) => `${e.delivery_day}||${e.supplier?.trim()}||${e.flow_name?.trim()}`;

              const toggleEntry = (e: typeof deliveryWeekEntries[0]) => {
                const k = entryKey(e);
                const next = selectedKeys.has(k) ? item.entryKeys.filter(x => x !== k) : [...item.entryKeys, k];
                setDeliveryMappingItems(prev => prev.map((it, i) => i === idx ? { ...it, entryKeys: next } : it));
              };
              const toggleDay = (entries: typeof deliveryWeekEntries) => {
                const dayKeys = entries.map(entryKey);
                const allSelected = dayKeys.every(k => selectedKeys.has(k));
                const next = allSelected
                  ? item.entryKeys.filter(k => !dayKeys.includes(k))
                  : [...new Set([...item.entryKeys, ...dayKeys])];
                setDeliveryMappingItems(prev => prev.map((it, i) => i === idx ? { ...it, entryKeys: next } : it));
              };
              const allKeys = deliveryWeekEntries.map(entryKey);
              const allSelected = allKeys.length > 0 && allKeys.every(k => selectedKeys.has(k));

              return (
                <div key={item.templateId} className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Truck className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                      <span className="text-sm font-semibold">{item.templateTitle}</span>
                    </div>
                    {deliveryWeekEntries.length > 1 && (
                      <button
                        type="button"
                        className="text-[11px] text-primary hover:underline shrink-0"
                        onClick={() => setDeliveryMappingItems(prev => prev.map((it, i) => i !== idx ? it : {
                          ...it,
                          entryKeys: allSelected ? [] : allKeys,
                        }))}
                      >
                        {allSelected ? "Avmarkera alla" : "Välj alla"}
                      </button>
                    )}
                  </div>
                  <div className="space-y-1 max-h-56 overflow-y-auto rounded-lg border border-border/50 p-2">
                    {deliveryWeekEntries.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-1">Inga leveranser i aktiv plan</p>
                    ) : sortedDays.map(dayName => {
                      const entries = byDay[dayName];
                      const dayKeys = entries.map(entryKey);
                      const allDaySelected = dayKeys.every(k => selectedKeys.has(k));
                      const someDaySelected = dayKeys.some(k => selectedKeys.has(k));
                      return (
                        <div key={dayName} className="space-y-0.5">
                          <label className="flex cursor-pointer items-center gap-2.5 rounded px-1.5 py-1.5 bg-muted/30 hover:bg-muted/50">
                            <Checkbox
                              checked={allDaySelected}
                              data-state={someDaySelected && !allDaySelected ? "indeterminate" : undefined}
                              onCheckedChange={() => toggleDay(entries)}
                              className="h-3.5 w-3.5"
                            />
                            <span className="text-xs font-semibold flex-1">{dayName}</span>
                            <span className="text-[10px] text-muted-foreground">{entries.length} lev.</span>
                          </label>
                          {entries.map(e => (
                            <label key={e.id} className="flex cursor-pointer items-center gap-2.5 rounded px-1.5 py-1.5 pl-6 hover:bg-muted/50">
                              <Checkbox
                                checked={selectedKeys.has(entryKey(e))}
                                onCheckedChange={() => toggleEntry(e)}
                                className="h-3.5 w-3.5"
                              />
                              <div className="flex-1 min-w-0">
                                <span className="text-xs">{e.supplier}</span>
                                <span className="text-[10px] text-muted-foreground ml-1.5">{e.flow_name}</span>
                              </div>
                              {e.delivery_time && <span className="text-[11px] font-medium text-foreground/70 tabular-nums shrink-0">{e.delivery_time}</span>}
                            </label>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                  {item.entryKeys.length > 0 && (
                    <p className="text-[11px] text-primary">
                      {item.entryKeys.length} leverans{item.entryKeys.length !== 1 ? "er" : ""} vald{item.entryKeys.length !== 1 ? "a" : ""}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          <div className="border-t border-border/60 flex justify-end gap-2 px-5 py-3">
            <Button variant="ghost" size="sm" onClick={() => setDeliveryMappingOpen(false)}>
              Hoppa över
            </Button>
            <Button
              size="sm"
              className="rounded-full"
              disabled={deliveryMappingSaving || deliveryMappingItems.every(i => !i.entryKeys.length)}
              onClick={saveDeliveryMapping}
            >
              {deliveryMappingSaving ? "Sparar..." : "Spara kopplingar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Article type disambiguation */}
      <AlertDialog open={!!mallArticlePrompt} onOpenChange={(o) => { if (!o) setMallArticlePrompt(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vad är <span className="font-mono">{mallArticlePrompt}</span>?</AlertDialogTitle>
            <AlertDialogDescription>Välj vilken typ av nummer — det avgör länken till Mitt Coop-sortiment.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            {(["mat-nr", "ean", "bnr"] as ArticleIdType[]).map((t) => (
              <AlertDialogAction key={t} onClick={() => { setMallArticleType(t); setMallArticlePrompt(null); }}>
                {t === "mat-nr" ? "Materialnummer" : t === "ean" ? "EAN-streckkod" : "BNR (Beställningsnr)"}
              </AlertDialogAction>
            ))}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
