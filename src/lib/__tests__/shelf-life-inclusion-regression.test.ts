import { describe, it, expect } from "vitest";
import {
  filterShelfLifeRecords,
  getShelfLifeStatus,
} from "../shelfLife";

// TDD-regression: articles that lack shelf-life data must be visible
// in "Hantera hållbarhetsdata" and in weekly-task calculations.

describe("shelf-life: articles without shelf life data are included", () => {
  const baseRecord = {
    id: "1",
    sap_article_id: "1234567890",
    shelf_lifetime_days: 0,
    expiry_date: "2026-12-01",
    arrival_date: "2026-01-01",
    compensation_price_ore: 100,
    product_name: "Test",
    brand: "Brand",
    category: "Kategori",
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    product_url: null,
    delivery_status: "Levererad",
    delivery_number: null,
    sap_data_missing: false,
    next_sap_check: null,
  };

  it("includes record with shelf_lifetime_days = 0 (missing shelf life)", () => {
    const record = { ...baseRecord, shelf_lifetime_days: 0 };
    const result = filterShelfLifeRecords([record], {});
    expect(result.length).toBe(1);
    expect(getShelfLifeStatus(record)).toBe("Hållbarhet saknas");
  });

  it("includes record with shelf_lifetime_days = null (missing shelf life)", () => {
    const record = { ...baseRecord, shelf_lifetime_days: null as any };
    const result = filterShelfLifeRecords([record], {});
    expect(result.length).toBe(1);
    expect(getShelfLifeStatus(record)).toBe("Hållbarhet saknas");
  });

  it("includes record with NaN shelf_lifetime_days", () => {
    const record = { ...baseRecord, shelf_lifetime_days: NaN };
    const result = filterShelfLifeRecords([record], {});
    expect(result.length).toBe(1);
    expect(getShelfLifeStatus(record)).toBe("Hållbarhet saknas");
  });

  it("includes record with shelf_lifetime_days = 0 in search", () => {
    const record = { ...baseRecord, shelf_lifetime_days: 0, product_name: "TestProdukt" };
    const result = filterShelfLifeRecords([record], { search: "TestProdukt" });
    expect(result.length).toBe(1);
  });

  it("includes record with shelf_lifetime_days = null in search", () => {
    const record = { ...baseRecord, shelf_lifetime_days: null as any, product_name: "TestProdukt" };
    const result = filterShelfLifeRecords([record], { search: "TestProdukt" });
    expect(result.length).toBe(1);
  });

  it("includes record with NaN shelf_lifetime_days in search", () => {
    const record = { ...baseRecord, shelf_lifetime_days: NaN, product_name: "TestProdukt" };
    const result = filterShelfLifeRecords([record], { search: "TestProdukt" });
    expect(result.length).toBe(1);
  });
});
