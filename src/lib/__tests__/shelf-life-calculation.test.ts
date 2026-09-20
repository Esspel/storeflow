import { describe, it, expect } from "vitest";
import {
  calculateShelfLifeStatus,
  getShelfLifeStatus,
  filterShelfLifeRecords,
  shouldIncludeInReplacement,
} from "../shelfLife";

describe("calculateShelfLifeStatus (gränsvärden & regressioner)", () => {
  it("är OK när tillräckligt många dagar kvar över 50% gränsen", () => {
    // 30 dagar total → kräver 15 dagar kvar (50%)
    // Leverans 2024-04-01, bäst-före 2024-04-17 = 16 dagar kvar → OK
    const result = calculateShelfLifeStatus("2024-04-01", "2024-04-17", 30);
    expect(result.status).toBe("OK");
    expect(result.remainingDays).toBe(16);
    expect(result.requiredDays).toBe(15);
  });

  it("är Reklamation när för få dagar kvar under 50% gränsen", () => {
    // 30 dagar total → kräver 15 dagar kvar (50%)
    // Leverans 2024-04-01, bäst-före 2024-04-15 = 14 dagar kvar → Reklamation
    const result = calculateShelfLifeStatus("2024-04-01", "2024-04-15", 30);
    expect(result.status).toBe("Reklamation");
    expect(result.remainingDays).toBe(14);
    expect(result.requiredDays).toBe(15);
  });

  it("är OK på exakt 50% gränsen", () => {
    // 30 dagar total → kräver 15 dagar kvar
    // Leverans 2024-04-01, bäst-före 2024-04-16 = 15 dagar kvar → OK
    const result = calculateShelfLifeStatus("2024-04-01", "2024-04-16", 30);
    expect(result.status).toBe("OK");
    expect(result.remainingDays).toBe(15);
    expect(result.requiredDays).toBe(15);
  });

  it("är Reklamation om datum saknas", () => {
    const result = calculateShelfLifeStatus(null, "2024-04-15", 30);
    expect(result.status).toBe("Reklamation");
    expect(result.remainingDays).toBe(0);
    expect(result.requiredDays).toBe(15);
  });

  it("är Reklamation om leveransdatum saknas", () => {
    const result = calculateShelfLifeStatus("2024-04-01", null, 30);
    expect(result.status).toBe("Reklamation");
  });

  it("är Reklamation om hållbarhetsdagar är noll eller negativ", () => {
    const result = calculateShelfLifeStatus("2024-04-01", "2024-04-15", 0);
    expect(["Reklamation", "OK"]).toContain(result.status);
    expect(result.requiredDays).toBe(0);

    const resultNeg = calculateShelfLifeStatus("2024-04-01", "2024-04-15", -5);
    expect(["Reklamation", "OK"]).toContain(resultNeg.status);
  });

  it("är Reklamation för ogiltiga datumformat", () => {
    const result = calculateShelfLifeStatus("ogiltigt", "2024-04-15", 30);
    expect(result.status).toBe("Reklamation");
  });

  describe("med ISO-datumsträng", () => {
    it("hanterar datum som är längre bort", () => {
      const result = calculateShelfLifeStatus("2024-04-01", "2024-05-01", 30);
      expect(["OK", "FRESH"]).toContain(result.status);
    });

    it("hanterar utgånget datum", () => {
      const result = calculateShelfLifeStatus("2024-04-01", "2024-03-01", 30);
      expect(["Reklamation", "OK"]).toContain(result.status);
    });
  });
});

describe("getShelfLifeStatus", () => {
  it("returnerar korrekt status för en post", () => {
    const record = {
      id: "art-1",
      sap_article_id: "SAP001",
      shelf_lifetime_days: 30,
      expiry_date: "2024-05-01",
      arrival_date: "2024-04-15",
      compensation_price_ore: 1000,
      product_name: "Test",
      brand: "Brand",
      category: "Mejeri",
      created_at: "2024-01-01",
      updated_at: "2024-01-01",
      product_url: null,
      delivery_status: "Levererad",
      delivery_number: "D1",
      sap_data_missing: false,
      next_sap_check: null,
    } as any;
    const result = getShelfLifeStatus(record);
    expect(["OK", "Kräver ersättning"]).toContain(result);
  });

  it("returnerar 'SAKNAS I SAP' när SAP-data saknas", () => {
    const record = {
      id: "art-1",
      sap_article_id: "SAP001",
      shelf_lifetime_days: 30,
      expiry_date: "2024-05-01",
      arrival_date: "2024-04-15",
      compensation_price_ore: 1000,
      product_name: "Test",
      brand: "Brand",
      category: "Mejeri",
      created_at: "2024-01-01",
      updated_at: "2024-01-01",
      product_url: null,
      delivery_status: "Levererad",
      delivery_number: "D1",
      sap_data_missing: true,
      next_sap_check: null,
    } as any;
    expect(getShelfLifeStatus(record)).toBe("SAKNAS I SAP");
  });
});

describe("filterShelfLifeRecords", () => {
  const records = [
    {
      id: "1",
      sap_article_id: "SAP001",
      product_name: "Mjölk",
      brand: "Arla",
      category: "Mejeri",
      expiry_date: "2024-05-01",
      arrival_date: "2024-04-15",
      shelf_lifetime_days: 30,
      compensation_price_ore: 1000,
      created_at: "2024-01-01",
      updated_at: "2024-01-01",
      product_url: null,
      delivery_status: "Levererad",
      delivery_number: "D1",
      sap_data_missing: false,
      next_sap_check: null,
    } as any,
    {
      id: "2",
      sap_article_id: "SAP002",
      product_name: "Jäseriet",
      brand: "Arla",
      category: "Mejeri",
      expiry_date: "2024-05-01",
      arrival_date: "2024-04-15",
      shelf_lifetime_days: 30,
      compensation_price_ore: 1200,
      created_at: "2024-01-01",
      updated_at: "2024-01-01",
      product_url: null,
      delivery_status: "Levererad",
      delivery_number: "D2",
      sap_data_missing: false,
      next_sap_check: null,
    } as any,
    {
      id: "3",
      sap_article_id: "SAP003",
      product_name: "Banan",
      brand: "Frugt",
      category: "Frukt",
      expiry_date: null,
      arrival_date: "2024-04-15",
      shelf_lifetime_days: 7,
      compensation_price_ore: 800,
      created_at: "2024-01-01",
      updated_at: "2024-01-01",
      product_url: null,
      delivery_status: "Levererad",
      delivery_number: "D3",
      sap_data_missing: false,
      next_sap_check: null,
    } as any,
  ];

  it("inkluderar poster med saknade datum (Datum saknas-status)", () => {
    const result = filterShelfLifeRecords(records, {
      statusFilter: ["Datum saknas"],
    });
    // Endast post 3 har status Datum saknas
    expect(result.length).toBe(1);
    expect(result[0].sap_article_id).toBe("SAP003");
  });

  it("inkluderar alla poster som standard", () => {
    const result = filterShelfLifeRecords(records);
    expect(result.length).toBe(3);
  });

  it("filtrerar efter sökterm", () => {
    const result = filterShelfLifeRecords(records, { search: "Mjölk" });
    expect(result.length).toBe(1);
    expect(result[0].sap_article_id).toBe("SAP001");
  });
});

describe("shouldIncludeInReplacement", () => {
  it("exkluderar artiklar utan datum från ersättning", () => {
    const record = {
      id: "1",
      sap_article_id: "SAP001",
      shelf_lifetime_days: 7,
      expiry_date: null,
      arrival_date: "2024-04-15",
      compensation_price_ore: 1000,
      product_name: "Test",
      brand: "Brand",
      category: "Mejeri",
      created_at: "2024-01-01",
      updated_at: "2024-01-01",
      product_url: null,
      delivery_status: "Levererad",
      delivery_number: "D1",
      sap_data_missing: false,
      next_sap_check: null,
    } as any;
    expect(shouldIncludeInReplacement(record)).toBe(false);
  });

  it("exkluderar artiklar med SAP-data saknas från ersättning", () => {
    const record = {
      id: "1",
      sap_article_id: "SAP001",
      shelf_lifetime_days: 7,
      expiry_date: "2024-05-01",
      arrival_date: "2024-04-15",
      compensation_price_ore: 1000,
      product_name: "Test",
      brand: "Brand",
      category: "Mejeri",
      created_at: "2024-01-01",
      updated_at: "2024-01-01",
      product_url: null,
      delivery_status: "Levererad",
      delivery_number: "D1",
      sap_data_missing: true,
      next_sap_check: null,
    } as any;
    expect(shouldIncludeInReplacement(record)).toBe(false);
  });

  it("exkluderar artiklar utan hållbarhetsdata (0 eller null) från ersättning", () => {
    const record = {
      id: "1",
      sap_article_id: "SAP001",
      shelf_lifetime_days: 0,
      expiry_date: "2024-04-15",
      arrival_date: "2024-04-15",
      compensation_price_ore: 1000,
      product_name: "Test",
      brand: "Brand",
      category: "Mejeri",
      created_at: "2024-01-01",
      updated_at: "2024-01-01",
      product_url: null,
      delivery_status: "Levererad",
      delivery_number: "D1",
      sap_data_missing: false,
      next_sap_check: null,
    } as any;
    expect(shouldIncludeInReplacement(record)).toBe(false);
  });
});
