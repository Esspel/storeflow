import { readFile } from "node:fs/promises";
import { PDFParse } from "pdf-parse";
const buffer = await readFile("C:/Users/erics/Downloads/Bryggkaffe Mellan Öster 2s.pdf");
const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
const parser = new PDFParse({ data: arrayBuffer });
const result = await parser.getText();
const lines = result.text.split("\n");
for (let i = 0; i < lines.length; i++) {
  const l = lines[i].trim();
  if (l.includes("POS EAN") || /^\d{1,2}\s+\d{13}/.test(l)) {
    console.log(i + 1 + ": " + l);
  }
}
