import { describe, it, expect } from "vitest";
import { shouldIncludeInReplacement } from "../shelfLife";

const minimalRecord = {
  id: "test-id",
  sap_article_id: "test-article",
  shelf_lifetime_days: 365,
  expiry_date: "2026-12-01T00:00:00.000Z",
  arrival_date: "2026-01-01T00:00:00.000Z",
  compensation_price_ore: 100,
  product_name: "Test Produkt",
  brand: "Test Brand",
  category: "Test Kategori",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  product_url: null,
  delivery_status: "Levererad",
  delivery_number: null,
  sap_data_missing: false,
  next_sap_check: null,
};

/**
 * Test that demonstrates the current state of generateReplacements filtering.
 * These tests verify the EXPECTED behavior after the fix.
 */
describe("Generate replacements - articles with missing data", () => {
  it("should exclude articles with missing best-before dates from replacement generation", () => {
    const recordMissingDates = {
      ...minimalRecord,
      sap_article_id: "test-1",
      expiry_date: "",
      arrival_date: "",
      shelf_lifetime_days: 365,
      sap_data_missing: false,
    };

    expect(shouldIncludeInReplacement(recordMissingDates)).toBe(false);
  });

  it("should exclude articles with SAKNAS I SAP status from replacement generation", () => {
    const recordSapMissing = {
      ...minimalRecord,
      sap_article_id: "test-2",
      expiry_date: "2026-12-01T00:00:00.000Z",
      arrival_date: "2026-01-01T00:00:00.000Z",
      shelf_lifetime_days: 365,
      sap_data_missing: true,
    };

    expect(shouldIncludeInReplacement(recordSapMissing)).toBe(false);
  });

  it("should include articles as Kräver ersättning when assessment is Reklamation", () => {
    const recordWithExpiry = {
      ...minimalRecord,
      sap_article_id: "test-3",
      expiry_date: "2026-02-01T00:00:00.000Z",
      arrival_date: "2026-01-01T00:00:00.000Z",
      shelf_lifetime_days: 365,
      sap_data_missing: false,
    };

    expect(shouldIncludeInReplacement(recordWithExpiry)).toBe(true);
  });
});
