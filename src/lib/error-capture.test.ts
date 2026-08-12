import { describe, it, expect, beforeEach, vi } from "vitest";
import { initErrorCapture, captureError, getRecentErrors } from "./error-capture";

describe("error-capture", () => {
  beforeEach(() => {
    // reset module state
    (window as any).__sfErrors = undefined;
    initErrorCapture();
  });

  it("captures and returns recent errors", () => {
    captureError(new Error("boom"));
    captureError(new Error("bang"));
    const recent = getRecentErrors();
    expect(recent.length).toBe(2);
    expect(recent[0]).toContain("boom");
  });

  it("caps at 100 entries", () => {
    for (let i = 0; i < 150; i++) captureError(new Error(`e${i}`));
    expect(getRecentErrors().length).toBe(100);
  });
});