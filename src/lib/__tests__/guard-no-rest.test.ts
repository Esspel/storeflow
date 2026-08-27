import { describe, it, expect } from "vitest";
import { FORBIDDEN_PATTERNS } from "@/lib/guard-no-rest";

describe("guard-no-rest", () => {
  it("FORBIDDEN_PATTERNS catches rest/v1 URLs", () => {
    // Build URL at runtime so the source-tree regex scanner does not flag this file
    const host = "abc" + "." + "supabase" + "." + "co";
    const textWithRest = "https://" + host + "/" + "rest" + "/" + "v1" + "/users";
    const hits = FORBIDDEN_PATTERNS.filter(({ regex }) => regex.test(textWithRest));
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => h.name === "supabase-rest-url")).toBe(true);
  });

  it("does not flag non-rest URLs", () => {
    const clean = "https://example.com/api/users";
    const hits = FORBIDDEN_PATTERNS.filter(({ regex }) => regex.test(clean));
    expect(hits).toHaveLength(0);
  });
});
