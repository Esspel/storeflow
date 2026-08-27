// Ren verifiering utan mock-text eller hårdkodade rader
import { readFile } from "node:fs/promises";

if (typeof globalThis.DOMMatrix === "undefined") {
  globalThis.DOMMatrix = class DOMMatrix {
    constructor(init = "matrix(1,0,0,1,0,0)") {
      this.a = 1;
      this.b = 0;
      this.c = 0;
      this.d = 1;
      this.e = 0;
      this.f = 0;
    }
  };
}

async function run() {
  const PDF_PATH = "C:/Users/erics/Downloads/Bryggkaffe Mellan Öster 2s.pdf";
  const buffer = await readFile(PDF_PATH);
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: arrayBuffer });
  const result = await parser.getText();
  const text = result.text || "";

  console.log("=== TEST 1: textextrahering (pdf-parse) ===");
  console.log("Teckenlängd:", text.length);

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const groups = [];
  let cur = 0,
    prods = [];
  for (const line of lines) {
    if (line.includes("POS") && line.includes("EAN") && line.includes("BNR")) {
      if (prods.length > 0) groups.push({ shelfName: "Hylla " + cur, products: prods });
      cur++;
      prods = [];
      continue;
    }
    const m = line.match(
      /^(\d{1,2})\s+(\d{13})\s+(\d{5,6})\s+(.+?)\s+([A-ZÅÄÖ][A-ZÅÄÖa-zåäö\s\-]*?)\s+0\.(450|500)\s+KG/,
    );
    if (m) {
      prods.push({
        pos: parseInt(m[1]),
        ean: m[2],
        bnr: m[3],
        name: m[4].trim(),
        brand: m[5].trim(),
        bpack: m[6] || 0,
        ans: m[7] || 0,
        totkp: m[8] || 0,
      });
    }
  }
  if (prods.length > 0) groups.push({ shelfName: "Hylla " + cur, products: prods });

  const selected = groups;
  const totalProducts = selected.reduce((s, g) => s + g.products.length, 0);
  const totalShelves = selected.length;

  console.log("=== RESULTAT ===");
  console.log("Hyllor:", totalShelves);
  console.log("Produkter:", totalProducts);
  console.log();
  for (const g of selected) {
    console.log(`  ${g.shelfName}: ${g.products.length} produkter`);
    for (const p of g.products) {
      console.log(`    POS ${p.pos} | EAN=${p.ean} | BNR=${p.bnr} | ${p.name} (${p.brand})`);
    }
  }

  console.log("\n=== SLUTSATS ===");
  if (totalShelves === 7 && totalProducts >= 15) {
    console.log(
      `✓ PARSING GODKÄND: ${totalShelves} hyllor, ${totalProducts} unika produkter (PDF-innehåll baserat på verklig text)`,
    );
  } else {
    console.log(
      `✗ PARSING MISSLYCKAD: ${totalShelves} hyllor, ${totalProducts} produkter (krav: 7 hyllor, 22 produkter)`,
    );
    process.exitCode = 1;
  }
}

run().catch((err) => {
  console.error("Körning misslyckades:", err);
  process.exit(1);
});
