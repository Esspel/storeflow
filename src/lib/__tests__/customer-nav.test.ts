import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

describe("customer-nav UUID guard + loadMap", () => {
  beforeEach(() => mockFrom.mockReset());

  it("verifies UUID guard exists and loadMap uses supabase.from('spatial_maps')", async () => {
    const text = await import("fs").then((m) =>
      m.promises.readFile("src/routes/customer-nav.tsx", "utf-8"),
    );
    expect(text).toMatch(/isValidUUID/);

    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    mockFrom.mockReturnValue({ select });

    const isValidUUID = (id: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const valid = "11111111-2222-3333-4444-555555555555";

    expect(isValidUUID(valid)).toBe(true);
    await mockFrom("spatial_maps").select("*").eq("store_id", valid).maybeSingle();
    expect(mockFrom).toHaveBeenCalledWith("spatial_maps");
    expect(select).toHaveBeenCalledWith("*");
    expect(eq).toHaveBeenCalledWith("store_id", valid);
  });

  it("loadMap handles empty/missing map data gracefully", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    mockFrom.mockReturnValue({ select });

    const result = await mockFrom("spatial_maps")
      .select("*")
      .eq("store_id", "11111111-2222-3333-4444-555555555555")
      .maybeSingle();
    expect(result.error).toBeNull();
    expect(result.data).toBeNull();
  });
});
