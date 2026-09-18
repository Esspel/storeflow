import { describe, it, expect } from "vitest";
import { calculateShelfLifeStatus, getShelfLifeStatus } from "../shelfLife";

describe("Invalid Date regression", () => {
  it("ska returnera Reklamation vid tom sträng som best-before (inte Invalid Date)", () => {
    const result = calculateShelfLifeStatus("2024-04-01", "", 30);
    expect(result.status).toBe("Reklamation");
    expect(result.remainingDays).toBe(0);
  });
});

describe("ShelfLifeRecord expiry_date handling", () => {
  it("ska INTE producera 'Invalid Date' i UI-nivån för tom/ogiltig expiry_date", () => {
    const record = {
      id: "1", sap_article_id: "SAP001", shelf_lifetime_days: 30,
      expiry_date: "", arrival_date: "2024-04-01",
      compensation_price_ore: 1000, product_name: "Test", brand: "B",
      category: "Mejeri", created_at: "2024-01-01", updated_at: "2024-01-01",
      product_url: null, delivery_status: "Levererad", delivery_number: "D1",
      sap_data_missing: false, next_sap_check: null,
    } as any;
    const status = getShelfLifeStatus(record);
    expect(["Datum saknas", "Kräver ersättning", "Hållbarhet saknas"]).toContain(status);
  });
});
