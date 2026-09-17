import { describe, it, expect } from "vitest";
import {
  calculateShelfLifeStatus,
  getShelfLifeStatus,
  filterShelfLifeRecords,
  shouldIncludeInReplacement,
} from "../shelfLife";

const baseRecord = {
  id: "1",
  sap_article_id: "1234567890",
  shelf_lifetime_days: 365,
  expiry_date: "2026-12-01T00:00:00.000Z",
  arrival_date: "2026-01-01T00:00:00.000Z",
  compensation_price_ore: 100,
  product_name: "Test",
  brand: "Brand",
  category: "Kategori",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  product_url: null,
  delivery_status: "Levererad",
  delivery_number: null,
  sap_data_missing: false,
  next_sap_check: null,
};

describe("Hållbarhetsstatus vid saknade data", () => {
  it("sätter 'SAKNAS I SAP' när sap_data_missing är true", () => {
    const result = getShelfLifeStatus({ ...baseRecord, sap_data_missing: true });
    expect(result).toBe("SAKNAS I SAP");
  });

  it("sätter 'Datum saknas' när arrival_date och expiry_date är tomma", () => {
    const result = getShelfLifeStatus({
      ...baseRecord,
      arrival_date: "",
      expiry_date: "",
    });
    expect(result).toBe("Datum saknas");
  });

  it("sätter 'Hållbarhet saknas' när shelf_lifetime_days är 0", () => {
    const result = getShelfLifeStatus({
      ...baseRecord,
      shelf_lifetime_days: 0,
      arrival_date: "2026-01-01T00:00:00.000Z",
      expiry_date: "2026-12-01T00:00:00.000Z",
    });
    expect(result).toBe("Hållbarhet saknas");
  });
});

describe("filterShelfLifeRecords", () => {
  it("inkluderar artiklar utan expiry_date", () => {
    const records = [
      { ...baseRecord, id: "1", expiry_date: "2026-12-01T00:00:00.000Z" },
      { ...baseRecord, id: "2", expiry_date: "" },
      { ...baseRecord, id: "3", expiry_date: null as unknown as string },
    ];
    const filtered = filterShelfLifeRecords(records, {
      search: "",
      statusFilter: [],
      excludedCategories: [],
    });
    expect(filtered).toHaveLength(3);
  });

  it("filtrerar bort utvalda kategorier", () => {
    const records = [
      { ...baseRecord, id: "1", category: "Färsk" },
      { ...baseRecord, id: "2", category: "Torrt" },
    ];
    const filtered = filterShelfLifeRecords(records, {
      search: "",
      statusFilter: [],
      excludedCategories: ["Färsk"],
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe("2");
  });
});

describe("shouldIncludeInReplacement", () => {
  it("inkluderar artiklar utan bäst-före-datum i ersättning", () => {
    const recordWithoutDate = {
      ...baseRecord,
      id: "2",
      expiry_date: "",
      arrival_date: "",
      shelf_lifetime_days: 365,
      sap_data_missing: false,
    };
    const result = shouldIncludeInReplacement(recordWithoutDate);
    expect(result).toBe(true);
  });

  it("inkluderar artiklar med SAKNAS I SAP-status", () => {
    const record = { ...baseRecord, sap_data_missing: true };
    const result = shouldIncludeInReplacement(record);
    expect(result).toBe(true);
  });

  it("inkluderar artiklar som kräver ersättning", () => {
    const record = {
      ...baseRecord,
      arrival_date: "2026-01-01T00:00:00.000Z",
      expiry_date: "2026-02-01T00:00:00.000Z",
      shelf_lifetime_days: 365,
    };
    const result = shouldIncludeInReplacement(record);
    expect(result).toBe(true);
  });
});
