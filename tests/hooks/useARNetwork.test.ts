import { renderHook, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useARNetwork } from "@/hooks/useARNetwork";
import type { Pose } from "@/lib/posemesh/types";

describe("useARNetwork", () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
    jest.resetModules();
  });

  it("should initialize with Auki credentials", async () => {
    process.env.VITE_AUKI_APP_KEY = "test-key";
    process.env.VITE_AUKI_APP_SECRET = "test-secret";

    const { result, waitForNextUpdate } = renderHook(() => useARNetwork(), {
      wrapper: MemoryRouter,
    });

    // Initial state
    expect(result.current.isConnecting).toBe(true);
    expect(result.current.error).toBeNull();

    // Wait for initialization
    await waitForNextUpdate();

    expect(result.current.isConnected).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it("should handle missing credentials", async () => {
    // Remove env vars for this test
    delete process.env.VITE_AUKI_APP_KEY;
    delete process.env.VITE_AUKI_APP_SECRET;

    const { result, waitForNextUpdate } = renderHook(() => useARNetwork(), {
      wrapper: MemoryRouter,
    });

    await waitForNextUpdate();

    expect(result.current.isConnected).toBe(false);
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toContain("Auki app credentials not configured");
  });

  it("should update pose", async () => {
    process.env.VITE_AUKI_APP_KEY = "test-key";
    process.env.VITE_AUKI_APP_SECRET = "test-secret";

    const { result, waitForNextUpdate } = renderHook(() => useARNetwork(), {
      wrapper: MemoryRouter,
    });

    await waitForNextUpdate();

    const testPose: Pose = {
      x: 1,
      y: 2,
      z: 3,
      q: { x: 0, y: 0, z: 0, w: 1 },
    };

    act(() => {
      result.current.updatePose(testPose);
    });

    expect(result.current.pose).toEqual(testPose);
  });

  it("should disconnect and reset state", async () => {
    process.env.VITE_AUKI_APP_KEY = "test-key";
    process.env.VITE_AUKI_APP_SECRET = "test-secret";

    const { result, waitForNextUpdate } = renderHook(() => useARNetwork(), {
      wrapper: MemoryRouter,
    });

    await waitForNextUpdate();

    expect(result.current.isConnected).toBe(true);

    act(() => {
      result.current.disconnect();
    });

    expect(result.current.isConnected).toBe(false);
    expect(result.current.domain).toBeNull();
    expect(result.current.pose).toBeNull();
  });
});