import { scanForRestCalls } from "../src/lib/guard-no-rest";

const violations = scanForRestCalls();
if (violations.length > 0) {
  console.error("Hittade forbjudna REST-anrop mot Supabase:");
  for (const v of violations) {
    console.error(`  ${v.file} -> ${v.pattern} (${v.match})`);
  }
  process.exit(1);
}
console.log("Inga REST-anrop hittades. ✓");
