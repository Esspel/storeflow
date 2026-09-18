import { describe, it, expect } from "vitest";
import { calculateShelfLifeStatus, getShelfLifeStatus, filterShelfLifeRecords } from "../shelfLife";

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

describe("calculateShelfLifeStatus regression", () => {
  it("invalid/missing dates ger Reklamation med requiredDays baserat på shelf_lifetime", () => {
    // 2024-04-01 → 2024-04-23 = 22 dagar kvar, shelf life 224 → kräver 112 (50%). 22 < 112 → Reklamation
    const result = calculateShelfLifeStatus("2024-04-01", "2024-04-23", 224);
    expect(result.requiredDays).toBe(112);
    expect(result.status).toBe("Reklamation");
  });

  it("tom expiry_date ger Reklamation utan att krascha", () => {
    const result = calculateShelfLifeStatus("2024-04-01", "", 30);
    expect(result.status).toBe("Reklamation");
    expect(result.remainingDays).toBe(0);
  });

  it("undefined dates ger Reklamation utan krasch", () => {
    const result = calculateShelfLifeStatus(null, undefined, 30);
    expect(result.status).toBe("Reklamation");
  });

  it("getShelfLifeStatus returnerar 'Datum saknas' för tom expiry_date", () => {
    const record = {
      ...baseRecord,
      arrival_date: "2024-04-01",
      expiry_date: "",
    };
    expect(getShelfLifeStatus(record)).toBe("Datum saknas");
  });

  it("filterShelfLifeRecords inkluderar post med tom expiry_date", () => {
    const records = [
      { ...baseRecord, id: "1", expiry_date: "2026-12-01T00:00:00.000Z", arrival_date: "2026-01-01", shelf_lifetime_days: 365 },
      { ...baseRecord, id: "2", expiry_date: "", arrival_date: "2026-01-01", shelf_lifetime_days: 30 },
    ];
    const filtered = filterShelfLifeRecords(records);
    expect(filtered.length).toBe(2);
  });

  it("filterShelfLifeRecords hanterar null expiry_date utan att krascha", () => {
    const records = [
      { ...baseRecord, id: "1", expiry_date: null as unknown as string, arrival_date: "2026-01-01", shelf_lifetime_days: 30 },
    ];
    const filtered = filterShelfLifeRecords(records);
    expect(filtered.length).toBe(1);
  });
});
