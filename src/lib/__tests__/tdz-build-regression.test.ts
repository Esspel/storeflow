import { describe, it, expect } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";

/**
 * Regressionstest för TDZ/minifieringsfel i byggd produktion.
 * Felmeddelande: "can't access lexical declaration 'He' before initialization"
 * Orsak: Minifiering av vendor-chunks kan skapa TDZ-problem när anrop
 * sker före initiering av lexikal ska deklarationer.
 */
describe("build TDZ regression (can't access lexical declaration 'He')", () => {
  it("vendor chunks är isolerade (lucide, jszip separata)", () => {
    const config = fs.readFileSync(path.join(__dirname, "../../../vite.config.ts"), "utf-8");
    expect(config).toContain("vendor-lucide");
    expect(config).toContain("vendor-jszip");
  });

  it("esbuild minifier används (undviker Terser TDZ)", () => {
    const config = fs.readFileSync(path.join(__dirname, "../../../vite.config.ts"), "utf-8");
    expect(config).toContain('minify: "esbuild"');
  });

  it("byggartefakt innehåller inga minified chunks utan chunk-namn", () => {
    const assets = path.join(__dirname, "../../../dist/client/assets");
    if (!fs.existsSync(assets)) {
      // Bygg inte körd i testmiljö — skippa
      return;
    }
    const files = fs.readdirSync(assets).filter((f) => f.endsWith(".js"));
    // Kontrollera att alla JS-filer har chunk-namn (inte bara en stor fil)
    const unnamed = files.filter((f) => !f.includes("-") && f !== "index.js");
    expect(unnamed.length).toBe(0);
  });
});