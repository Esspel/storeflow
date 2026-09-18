import { describe, it, expect } from "vitest";
import { calculateShelfLifeStatus } from "../shelfLife";

describe("ShelfLife regression (weeklyTask false positive)", () => {
  it("ska ge requiredDays baserat på shelf_lifetime_days", () => {
    const result = calculateShelfLifeStatus("2024-04-01", "2024-04-23", 224);
    expect(result.requiredDays).toBe(112);
    expect(result.remainingDays).toBe(22);
  });
  it("ska INTE inkludera artiklar med 0 dagar kvar om expiry_date saknas", () => {
    const result = calculateShelfLifeStatus("2024-04-01", "", 30);
    expect(result.status).toBe("Reklamation");
    expect(result.remainingDays).toBe(0);
  });
});
