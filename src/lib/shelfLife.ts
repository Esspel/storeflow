/**
 * Shelf life calculation and status utilities.
 * Used by the replacement check view and regression tests.
 */

export type ShelfLifeStatus =
  | "OK"
  | "Kräver ersättning"
  | "Datum saknas"
  | "Hållbarhet saknas"
  | "SAKNAS I SAP"
  | "Kan inte bedömas";

export interface ShelfLifeAssessment {
  remainingDays: number;
  requiredDays: number;
  status: "OK" | "Reklamation" | "Kan inte bedömas";
  percentageLeft: number;
}

export interface ShelfLifeRecord {
  id: string;
  sap_article_id: string;
  shelf_lifetime_days: number;
  expiry_date: string;
  arrival_date: string;
  compensation_price_ore: number;
  product_name: string;
  brand: string;
  category: string;
  created_at: string;
  updated_at: string;
  product_url: string | null;
  delivery_status: string;
  delivery_number: string | null;
  sap_data_missing: boolean;
  next_sap_check: string | null;
}

export interface FilterOptions {
  search?: string;
  statusFilter?: ShelfLifeStatus[];
  excludedCategories?: string[];
}

/**
 * Core shelf life status calculation using Coop's rules:
 * - >548 days shelf life → required 274 days remaining
 * - otherwise → required 50% of shelf life
 * If either date is missing, treats as Reklamation (for UI purposes).
 */
export function calculateShelfLifeStatus(
  deliveryDate: string | null | undefined,
  bestBeforeDate: string | null | undefined,
  totalShelfLifeDays: number,
): ShelfLifeAssessment {
  /**
   * Parses a date string into a UTC timestamp (ms).
   * Uses Date.UTC(y, mo, d) for YYYY-MM-DD strings so the result is
   * independent of the client's local time zone. Other formats (e.g.
   * ISO with time or "Date(xxx)") are parsed as before via new Date().
   */
  const parseDate = (dateStr: string | null | undefined): number | null => {
    if (dateStr == null || dateStr === "—" || String(dateStr).trim() === "") return null;
    // YYYY-MM-DD pure calendar date → deterministic UTC midnight
    const isoMatch = String(dateStr)
      .trim()
      .match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
      const [, y, mo, d] = isoMatch;
      const ts = Date.UTC(parseInt(y, 10), parseInt(mo, 10) - 1, parseInt(d, 10));
      return Number.isNaN(ts) ? null : ts;
    }
    if (String(dateStr).startsWith("Date(")) {
      const match = String(dateStr).match(/Date\((\d+)\)/);
      if (!match) return null;
      const timestamp = parseInt(match[1], 10);
      if (timestamp < 0 || timestamp > 86400000 * 365 * 100) return null;
      const d = new Date(timestamp);
      if (isNaN(d.getTime())) return null;
      return d.getTime();
    }
    const date = new Date(String(dateStr));
    if (isNaN(date.getTime())) return null;
    return date.getTime();
  };

  const deliveryMs = parseDate(deliveryDate);
  const bestBeforeMs = parseDate(bestBeforeDate);

  if (deliveryMs === null || bestBeforeMs === null) {
    return {
      remainingDays: 0,
      requiredDays: totalShelfLifeDays <= 0 ? 0 : Math.floor(totalShelfLifeDays * 0.5),
      status: "Reklamation",
      percentageLeft: 0,
    };
  }

  const msPerDay = 1000 * 60 * 60 * 24;
  const remainingDays = Math.floor((bestBeforeMs - deliveryMs) / msPerDay);
  const requiredDays = totalShelfLifeDays <= 0 ? 0 : Math.floor(totalShelfLifeDays * 0.5);

  return {
    remainingDays,
    requiredDays,
    status: remainingDays < requiredDays ? "Reklamation" : "OK",
    percentageLeft: totalShelfLifeDays > 0 ? remainingDays / totalShelfLifeDays : 0,
  };
}

/**
 * Returns the human-readable status for a shelf life record.
 * Order matters: sap_data_missing === true → datum → shelf_lifetime → calculate.
 * sap_data_missing: null = not yet fetched, sap_data_missing: true = SAP answered but no data.
 */
export function getShelfLifeStatus(record: ShelfLifeRecord): ShelfLifeStatus {
  if (record.sap_data_missing === true) return "SAKNAS I SAP";
  if (!record.arrival_date || !record.expiry_date) return "Datum saknas";
  if (
    record.shelf_lifetime_days == null ||
    Number.isNaN(record.shelf_lifetime_days) ||
    record.shelf_lifetime_days <= 0
  ) {
    return "Hållbarhet saknas";
  }
  const assessment = calculateShelfLifeStatus(
    record.arrival_date,
    record.expiry_date,
    record.shelf_lifetime_days,
  );
  return assessment?.status === "Reklamation" ? "Kräver ersättning" : "OK";
}

/**
 * Filters shelf life records, INCLUDING those without expiry_date
 * (they show as "Datum saknas" / "SAKNAS I SAP").
 */
export function filterShelfLifeRecords(
  records: ShelfLifeRecord[],
  options: FilterOptions = {},
): ShelfLifeRecord[] {
  const search = (options.search ?? "").trim().toLocaleLowerCase("sv");
  const statusFilter = options.statusFilter ?? [];
  const excludedCategories = new Set(
    (options.excludedCategories ?? []).map((c) => c.toLocaleLowerCase("sv")),
  );

  return records.filter((record) => {
    const status = getShelfLifeStatus(record);

    // Always include records with missing dates (Datum saknas / SAKNAS I SAP)
    // Only apply expiry filter when we have a date but want to exclude
    if (!record.expiry_date && status !== "Datum saknas" && status !== "SAKNAS I SAP") {
      return false;
    }

    if (search) {
      const haystack = [
        record.sap_article_id,
        record.product_name,
        record.brand,
        String(record.shelf_lifetime_days ?? ""),
        record.expiry_date,
        record.arrival_date,
        status,
      ]
        .map((v) => String(v ?? ""))
        .join(" ")
        .toLocaleLowerCase("sv");
      if (!haystack.includes(search)) return false;
    }

    if (statusFilter.length > 0 && !statusFilter.includes(status)) return false;

    // SAKNAS I SAP records only visible when explicitly selected in status filter
    // (or when actively searching to locate a specific article)
    if (status === "SAKNAS I SAP" && !statusFilter.includes("SAKNAS I SAP") && !search) {
      return false;
    }

    const cat = record.category?.toLocaleLowerCase("sv") ?? "";
    if (excludedCategories.size > 0 && excludedCategories.has(cat)) return false;

    return true;
  });
}

/**
 * Determines whether a record should be included in replacement generation.
 * Articles with missing data (sap_data_missing, no dates, no shelf life) are
 * EXCLUDED from replacement generation – they should be resolved manually
 * in "Hantera hållbarhetsdata" instead.
 */
export function shouldIncludeInReplacement(record: ShelfLifeRecord): boolean {
  if (record.sap_data_missing === true) return false;
  if (!record.arrival_date || !record.expiry_date) return false;
  if (
    record.shelf_lifetime_days == null ||
    Number.isNaN(record.shelf_lifetime_days) ||
    record.shelf_lifetime_days <= 0
  ) {
    return false;
  }
  const assessment = calculateShelfLifeStatus(
    record.arrival_date,
    record.expiry_date,
    record.shelf_lifetime_days,
  );
  return assessment?.status === "Reklamation";
}
