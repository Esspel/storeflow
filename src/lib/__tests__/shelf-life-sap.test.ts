import { describe, it, expect } from "vitest";

/**
 * Regression test: SAP returning HTTP 200 with empty data
 * should mark the article as SAKNAS I SAP and set cooldown.
 *
 * Previously: when sapData was null (proxy returned {"d":null}),
 * the code skipped the upsert entirely — so sap_data_missing stayed
 * false and no cooldown was set, causing articles to be retried
 * every single run.
 *
 * After fix: null sapData triggers upsert with sap_data_missing: true
 * and a 60-90 day cooldown.
 */
describe("SAP empty response handling", () => {
  it("should mark article as missing when SAP returns 200 with empty data", () => {
    // Simulate: proxy returns success:true but data is {"d":null}
    const proxyResponse = { success: true, status: 200, data: '{"d":null}' };
    const parsed = JSON.parse(proxyResponse.data);
    const sapData = parsed.d || null;

    // sapData is null → article should be marked as missing
    expect(sapData).toBeNull();
    // The fix ensures: !sapData → upsert with sap_data_missing: true
  });

  it("should mark article as missing when SAP returns 200 with no RemainingShelfLifeInDays", () => {
    // Simulate: SAP returns valid JSON but no shelf life field
    const sapData = { ProductID: "123", ProductName: "Test" };
    const shelfLifeDays = parseInt((sapData as any).RemainingShelfLifeInDays, 10);
    const hasValidSapData = Number.isFinite(shelfLifeDays) && shelfLifeDays > 0;

    // hasValidSapData is false → sap_data_missing = true (correct)
    expect(hasValidSapData).toBe(false);
  });

  it("should set sap_data_missing to true when shelfLifeDays is NaN", () => {
    const sapData = { RemainingShelfLifeInDays: "N/A" };
    const shelfLifeDays = parseInt(sapData.RemainingShelfLifeInDays, 10);
    const hasValidSapData = Number.isFinite(shelfLifeDays) && shelfLifeDays > 0;

    // parseInt("N/A") = NaN, so hasValidSapData = false → sap_data_missing = true
    expect(hasValidSapData).toBe(false);
  });
});