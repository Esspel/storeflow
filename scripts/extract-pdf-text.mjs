import { readFile } from "node:fs/promises";
import { PDFParse } from "pdf-parse";
const buffer = await readFile("C:/Users/erics/Downloads/Bryggkaffe Mellan Öster 2s.pdf");
const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
const parser = new PDFParse({ data: arrayBuffer });
const result = await parser.getText();
console.log(result.text);
