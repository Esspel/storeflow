import { describe, it, expect } from "vitest";
import { parsePlanogramPdf } from "@/lib/planogram-parser";

describe("planogram-parser", () => {
  it("handles empty PDF data gracefully", async () => {
    await expect(parsePlanogramPdf(new ArrayBuffer(0))).rejects.toBeDefined();
  });

  it("handles corrupt PDF data gracefully", async () => {
    await expect(parsePlanogramPdf(new Uint8Array([0x00, 0x01, 0xff]).buffer)).rejects.toBeDefined();
  });
});
