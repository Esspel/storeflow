import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

describe("digital-twin", () => {
  beforeEach(() => mockFrom.mockReset());

  it("upsertStoreSection (saveSection) happy path", async () => {
    mockFrom.mockReturnValue({ upsert: () => ({ error: null }) });
    const { saveSection } = await import("@/lib/digital-twin");
    await saveSection("store-1", {
      id: "s1",
      name: "Aisle",
      pos_x_cm: 10,
      pos_y_cm: 20,
      width_cm: 100,
      height_cm: 50,
    });
    expect(mockFrom).toHaveBeenCalledWith("store_sections");
  });

  it("upsertStoreSection RLS rejection throws", async () => {
    mockFrom.mockReturnValue({ upsert: () => ({ error: { message: "RLS denied" } }) });
    const { saveSection } = await import("@/lib/digital-twin");
    await expect(
      saveSection("store-1", {
        id: "s1",
        name: "Aisle",
        pos_x_cm: 1,
        pos_y_cm: 2,
        width_cm: 3,
        height_cm: 4,
      }),
    ).rejects.toThrow();
  });
});
