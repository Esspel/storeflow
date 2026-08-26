/**
 * Unifierad CSV-grund för StoreFlow.
 *
 * All export använder semikolon som avgränsare och lägger alltid till BOM
 * så att Excel öppnar filen med rätt teckenkodning. All parsing är quote-medveten
 * och hanterar `""`-escapning samt \r\n-radslut.
 */

/** Skyddar mot CSV-formulainjektion: prefixar `'` om värdet börjar med `=`, `+`, `-`, `@`, tabb eller radbrytning. */
function sanitizeCsvCell(value: string): string {
  if (/^[=+\-@\t\r]/.test(value)) {
    return `'${value}`;
  }
  return value;
}

/** Eskaperar ett fält för semikolon-CSV: skyddar mot formulainjektion och quote:ar vid behov. */
export function csvEscape(value: string): string {
  const safe = sanitizeCsvCell(value);
  if (safe.includes(";") || safe.includes('"') || safe.includes("\n") || safe.includes("\r")) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

/** Bygger semikolon-separerad CSV från rader och startar en nedladdning (alltid BOM för Excel). */
export function exportCSV(
  rows: (string | number | boolean | null | undefined)[][],
  filename: string,
): void {
  const csv = rows
    .map((r) => r.map((v) => csvEscape(v == null ? "" : String(v))).join(";"))
    .join("\n");
  exportTextAsCSV(csv, filename);
}

/** Startar nedladdning av färdig CSV-text och lägger alltid till BOM (om den inte redan har en). */
export function exportTextAsCSV(text: string, filename: string): void {
  const content = text.startsWith("\ufeff") ? text : "\ufeff" + text;
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Startar nedladdning av en ZIP-fil byggd från filnamn + innehåll. */
export async function downloadAsZip(
  files: Array<{ name: string; content: string }>,
  zipName: string,
): Promise<void> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.name, file.content);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = zipName;
  a.click();
  URL.revokeObjectURL(url);
}

/** Parserar en CSV-rad (quote-medveten, hanterar `""`-escapning). Returnerar råa fält utan trimning. */
export function parseCSVLine(text: string, delimiter = ";"): string[] {
  const cols: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuote && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (ch === delimiter && !inQuote) {
      cols.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cols.push(cur);
  return cols;
}

/** Parserar hela CSV-texten till rader (tar bort BOM, hanterar \r\n, hoppar över tomma och `#`-rader). */
export function parseCSV(text: string, delimiter = ";"): string[][] {
  return text
    .replace(/^\ufeff/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith("#"))
    .map((l) => parseCSVLine(l, delimiter));
}
