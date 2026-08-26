/**
 * Convert Excel serial date to ISO date string.
 *
 * Excel's 1900 date system: serial 1 = 1900-01-01. The system has a known bug
 * where it treats 1900 as a leap year, so we anchor to 1899-12-30 and add
 * `serial * 86_400_000` ms to get the correct UTC date.
 *
 * Accepts number, string, Date, or null/undefined. Returns `YYYY-MM-DD` or
 * `null` for empty/invalid input.
 */
export function excelSerialToIsoDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  const epoch = Date.UTC(1899, 11, 30);
  const ms = epoch + num * 86_400_000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}
