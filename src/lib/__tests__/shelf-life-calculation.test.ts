import { describe, it, expect } from "vitest";
import { calculateShelfLifeStatus } from "../shelfLife";

describe("calculateShelfLifeStatus (requirement: Math.floor(totalDays*0.5), >=threshold = OK)", () => {
  // Per Coop:s hållbarhetsregler:
  // - Artiklar med ≤18 månaders total hållbarhet måste ha kvar minst 50% vid leverans
  // - Math.floor(totalDays*0.5) avgör kravet (extra dag vid ojämnt faller butiken tillbaka)
  // - Status: remainingDays >= requiredDays → "OK", annars "Reklamation"
  // - Artiklar med >18 månader (548 dagar) kräver 9 månader (274 dagar) kvar

  describe("≤548 dagar (≤18 månader): Math.floor(totalDays * 0.5)", () => {
    it("365 days total -> required = floor(182.5) = 182", () => {
      const r = calculateShelfLifeStatus("2026-01-01T00:00:00.000Z", "2026-07-02T00:00:00.000Z", 365);
      expect(r.requiredDays).toBe(182);
    });

    it("365 days, remaining >= required -> OK", () => {
      const r = calculateShelfLifeStatus("2026-01-01T00:00:00.000Z", "2026-07-03T00:00:00.000Z", 365);
      expect(r.status).toBe("OK");
    });

    it("365 days, remaining 181 < required -> Reklamation", () => {
      const r = calculateShelfLifeStatus("2026-01-01T00:00:00.000Z", "2026-07-01T00:00:00.000Z", 365);
      expect(r.status).toBe("Reklamation");
    });

    it("100 days total -> required = floor(50) = 50", () => {
      const r = calculateShelfLifeStatus("2026-01-01T00:00:00.000Z", "2026-02-20T00:00:00.000Z", 100);
      expect(r.requiredDays).toBe(50);
    });

    it("100 days, remaining 50 -> OK", () => {
      const r = calculateShelfLifeStatus("2026-01-01T00:00:00.000Z", "2026-02-21T00:00:00.000Z", 100);
      expect(r.status).toBe("OK");
    });

    it("100 days, remaining 49 -> Reklamation", () => {
      const r = calculateShelfLifeStatus("2026-01-01T00:00:00.000Z", "2026-02-19T00:00:00.000Z", 100);
      expect(r.status).toBe("Reklamation");
    });

    it("101 days total -> required = floor(50.5) = 50", () => {
      const r = calculateShelfLifeStatus("2026-01-01T00:00:00.000Z", "2026-02-20T00:00:00.000Z", 101);
      expect(r.requiredDays).toBe(50);
    });

    it("101 days, remaining 50 -> OK (extra day to store)", () => {
      const r = calculateShelfLifeStatus("2026-01-01T00:00:00.000Z", "2026-02-21T00:00:00.000Z", 101);
      expect(r.status).toBe("OK");
    });

    it("548 days (18 months) -> required = 274", () => {
      const r = calculateShelfLifeStatus("2026-01-01T00:00:00.000Z", "2027-06-30T00:00:00.000Z", 548);
      expect(r.requiredDays).toBe(274);
    });

    it("548 days total, 274 remaining -> OK (exact boundary)", () => {
      const r = calculateShelfLifeStatus("2026-01-01T00:00:00.000Z", "2027-06-30T00:00:00.000Z", 548);
      expect(r.status).toBe("OK");
    });
  });

  describe(">548 dagar (>18 månader): 274 dagar krav", () => {
    it("549 days total -> required = 274 (floor(549*0.5)=274)", () => {
      const r = calculateShelfLifeStatus("2026-01-01T00:00:00.000Z", "2027-06-29T00:00:00.000Z", 549);
      expect(r.requiredDays).toBe(274);
    });

    it("549 days, remaining 274 -> OK (exact 9 months)", () => {
      const r = calculateShelfLifeStatus("2026-01-01T00:00:00.000Z", "2027-06-29T00:00:00.000Z", 549);
      expect(r.status).toBe("OK");
    });

    it("730 days (2 years) -> required = 274", () => {
      const r = calculateShelfLifeStatus("2026-01-01T00:00:00.000Z", "2028-01-01T00:00:00.000Z", 730);
      expect(r.requiredDays).toBe(274);
    });

    it("730 days, remaining 273 -> Reklamation", () => {
      const r = calculateShelfLifeStatus("2026-01-01T00:00:00.000Z", "2026-10-01T00:00:00.000Z", 730);
      expect(r.status).toBe("Reklamation");
    });
  });

  describe("edge cases", () => {
    it("zero total shelf life -> required = 0, status OK", () => {
      const r = calculateShelfLifeStatus("2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z", 0);
      expect(r.requiredDays).toBe(0);
      expect(r.status).toBe("OK");
    });

    it("negative total shelf life -> required = 0, status OK", () => {
      const r = calculateShelfLifeStatus("2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z", -100);
      expect(r.requiredDays).toBe(0);
      expect(r.status).toBe("OK");
    });

    it("same dates -> remaining=0, required depends on total", () => {
      const r = calculateShelfLifeStatus("2026-06-15T00:00:00.000Z", "2026-06-15T00:00:00.000Z", 365);
      expect(r.remainingDays).toBe(0);
      expect(r.requiredDays).toBe(182);
      expect(r.status).toBe("Reklamation"); // 0 < 182
    });

    it("far-future best before -> long remaining", () => {
      const r = calculateShelfLifeStatus("2026-01-01T00:00:00.000Z", "2028-01-01T00:00:00.000Z", 365);
      expect(r.status).toBe("OK");
    });

    it("past best before -> negative remaining", () => {
      const r = calculateShelfLifeStatus("2026-01-01T00:00:00.000Z", "2025-12-31T00:00:00.000Z", 365);
      expect(r.remainingDays).toBeLessThan(0);
      expect(r.status).toBe("Reklamation");
    });
  });
});