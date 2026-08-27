/**
 * Forbjuder REST-anrop mot Supabase.
 * Anvands av scripts/check-no-rest.ts (CI) och kan importeras i tester.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const FORBIDDEN_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: "supabase-rest-url", regex: /\.supabase\.co\/rest\/v1\//i },
  { name: "supabase-storage-url", regex: /\.supabase\.co\/storage\/v1\//i },
];

const SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);

export interface Violation {
  file: string;
  pattern: string;
  match: string;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

export function scanForRestCalls(rootDir: string = join(process.cwd(), "src")): Violation[] {
  const violations: Violation[] = [];
  for (const file of walk(rootDir)) {
    const ext = file.slice(file.lastIndexOf("."));
    if (!SCAN_EXTENSIONS.has(ext)) continue;
    const text = readFileSync(file, "utf-8");
    for (const { name, regex } of FORBIDDEN_PATTERNS) {
      const m = text.match(regex);
      if (m) violations.push({ file, pattern: name, match: m[0] });
    }
  }
  return violations;
}
