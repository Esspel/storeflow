import { describe, it, expect } from "vitest";
import { calculateRiskScore } from "../productCatalogRisk";

describe("calculateRiskScore (Produktkatalog riskindikator)", () => {
  it("returnerar 0 när det inte finns några leveranser", () => {
    expect(calculateRiskScore(0, 0)).toBe(0);
  });

  it("returnerar 0 när det inte finns några reklamationer", () => {
    expect(calculateRiskScore(0, 5)).toBe(0);
  });

  it("beräknar korrekt för 3 av 5 leveranser som har reklamerats", () => {
    expect(calculateRiskScore(3, 5)).toBeCloseTo(0.6, 10);
  });

  it("returnerar konservativt värde för 1 av 1 leverans (lågt underlag)", () => {
    expect(calculateRiskScore(1, 1)).toBeCloseTo(0.2, 10);
  });

  it("returnerar 0 för negativa värden (datafel)", () => {
    expect(calculateRiskScore(-1, 5)).toBe(0);
    expect(calculateRiskScore(1, -1)).toBe(0);
  });

  it("returnerar 0 för NaN-värden", () => {
    expect(calculateRiskScore(NaN, 5)).toBe(0);
    expect(calculateRiskScore(1, NaN)).toBe(0);
  });

  it("beräknar korrekt för 2 av 4 leveranser", () => {
    expect(calculateRiskScore(2, 4)).toBeCloseTo(0.4, 10);
  });

  it("ger full risk vid 5+ leveranser", () => {
    expect(calculateRiskScore(2, 5)).toBeCloseTo(0.4, 10);
  });
});
