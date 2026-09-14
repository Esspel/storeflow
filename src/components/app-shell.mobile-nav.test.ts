import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Regression test: mobile bottom nav must include "Uppgifter".
 *
 * Root cause (commit 6e6fd2f): `nav` array in AppShell lost its
 * Uppgifter entry when the item moved into the desktop DropdownMenu.
 * Fix (commit 4b2118d) restored the desktop dropdown but did NOT
 * restore the mobile nav item.
 *
 * Mobile nav is rendered exclusively from this `nav` array:
 *   { to, label, mobileHidden, Icon }[]
 * Items with `mobileHidden: false` appear in the mobile bottom bar;
 * items not present in the array at all never render on mobile.
 *
 * To verify locally: temporarily remove the `{ to: "/uppgifter", ... }`
 * entry from `nav` in src/components/app-shell.tsx — this test should
 * fail. Restoring it should make the test pass again.
 *
 * Run: npx vitest run src/components/app-shell.mobile-nav.test.ts
 */

const APP_SHELL_PATH = path.join(__dirname, "app-shell.tsx");

describe("AppShell mobile nav", () => {
  it("includes 'Uppgifter' as a visible (mobileHidden=false) nav item", () => {
    const source = fs.readFileSync(APP_SHELL_PATH, "utf-8");

    // The nav array starts with `const nav = [` and ends with the
    // matching `];` on its own line — a stable anchor for extraction.
    const navStart = source.indexOf("const nav = [");
    expect(navStart, "nav array not found in app-shell.tsx").toBeGreaterThan(-1);

    const afterNavStart = source.slice(navStart);
    const navEnd = afterNavStart.indexOf("\n  ];");
    expect(navEnd, "nav array end not found").toBeGreaterThan(-1);

    const navBody = afterNavStart.slice(0, navEnd + "\n  ];".length);

    // Verify the entry for Uppgifter exists and is mobile-visible.
    const uppgifterEntryMatch = navBody.match(
      /\{\s*to:\s*"\/uppgifter"[\s\S]*?Icon:\s*ClipboardList\s*\},/,
    );
    expect(
      uppgifterEntryMatch,
      "'/uppgifter' entry missing from nav array (mobile nav will not show Uppgifter)",
    ).not.toBeNull();

    if (uppgifterEntryMatch) {
      expect(
        uppgifterEntryMatch[0],
        "Uppgifter nav entry should have mobileHidden: false to appear in bottom bar",
      ).toContain("mobileHidden: false");
    }
  });
});
