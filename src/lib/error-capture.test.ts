import { describe, it, expect, beforeEach, vi } from "vitest";
import { initErrorCapture, captureError, getRecentErrors, consumeLastCapturedError } from "./error-capture";

describe("error-capture", () => {
  beforeEach(() => {
    // reset module state by re-importing the module
    vi.resetModules();
  });

  it("captures and returns recent errors with timestamp and stack trace", async () => {
    const { captureError: c1, getRecentErrors: g1 } = await import("./error-capture");
    c1(new Error("boom"));
    c1(new Error("bang"));
    const recent = g1();
    expect(recent.length).toBe(2);
    expect(recent[0]).toContain("boom");
    expect(recent[0]).toMatch(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/); // ISO timestamp prefix
    expect(recent[1]).toContain("bang");
  });

  it("includes stack trace in captured error", async () => {
    const { captureError: c2, getRecentErrors: g2 } = await import("./error-capture");
    const err = new Error("stack test");
    err.stack = "Error: stack test\n    at testFn (test.js:1:1)";
    c2(err);
    const recent = g2();
    expect(recent[0]).toContain("stack test");
    expect(recent[0]).toContain("at testFn");
  });

  it("caps at 100 entries (FIFO eviction)", async () => {
    const { captureError: c3, getRecentErrors: g3 } = await import("./error-capture");
    for (let i = 0; i < 150; i++) c3(new Error(`e${i}`));
    const recent = g3();
    expect(recent.length).toBe(100);
    // Should contain the last 100 (e50 through e149)
    expect(recent[0]).toContain("e50");
    expect(recent[99]).toContain("e149");
  });

  it("consumeLastCapturedError returns and removes the last error", async () => {
    const { captureError: c4, getRecentErrors: g4, consumeLastCapturedError: cl4 } = await import("./error-capture");
    c4(new Error("first"));
    c4(new Error("second"));
    c4(new Error("third"));

    const consumed = cl4();
    expect(consumed).toContain("third");
    expect(g4().length).toBe(2);

    const consumed2 = cl4();
    expect(consumed2).toContain("second");
    expect(g4().length).toBe(1);
  });

  it("consumeLastCapturedError returns null when buffer empty", async () => {
    const { consumeLastCapturedError: cl5 } = await import("./error-capture");
    const consumed = cl5();
    expect(consumed).toBeNull();
  });

  it("initErrorCapture attaches window error listeners", async () => {
    const { initErrorCapture } = await import("./error-capture");
    const addEventListenerSpy = vi.spyOn(window, "addEventListener");
    initErrorCapture();
    expect(addEventListenerSpy).toHaveBeenCalledWith("error", expect.any(Function));
    expect(addEventListenerSpy).toHaveBeenCalledWith("unhandledrejection", expect.any(Function));
    addEventListenerSpy.mockRestore();
  });

  it("window.error listener captures error objects", async () => {
    const { initErrorCapture, getRecentErrors } = await import("./error-capture");
    initErrorCapture();

    // Simulate window.error event
    const errorEvent = new ErrorEvent("error", { error: new Error("window error"), message: "window error" });
    window.dispatchEvent(errorEvent);

    const recent = getRecentErrors();
    expect(recent.length).toBe(1);
    expect(recent[0]).toContain("window error");
  });

  it("unhandledrejection listener captures rejection reasons", async () => {
    const { initErrorCapture, getRecentErrors } = await import("./error-capture");
    initErrorCapture();

    // Simulate unhandledrejection - need to catch the promise to avoid unhandled rejection
    const promise = Promise.reject(new Error("promise rejected")).catch(() => {});
    const rejectionEvent = new PromiseRejectionEvent("unhandledrejection", { promise, reason: new Error("promise rejected") });
    window.dispatchEvent(rejectionEvent);

    const recent = getRecentErrors();
    expect(recent.length).toBe(1);
    expect(recent[0]).toContain("promise rejected");
  });

  it("handles non-Error rejection reasons", async () => {
    const { initErrorCapture, getRecentErrors } = await import("./error-capture");
    initErrorCapture();

    // Simulate unhandledrejection with string reason
    const promise = Promise.reject("string reason").catch(() => {});
    const rejectionEvent = new PromiseRejectionEvent("unhandledrejection", { promise, reason: "string reason" });
    window.dispatchEvent(rejectionEvent);

    const recent = getRecentErrors();
    expect(recent.length).toBe(1);
    expect(recent[0]).toContain("string reason");
  });

  it("truncates long entries to 2000 chars", async () => {
    const { captureError: c9, getRecentErrors: g9 } = await import("./error-capture");
    const longMessage = "x".repeat(3000);
    c9(new Error(longMessage));
    const recent = g9();
    expect(recent[0].length).toBeLessThanOrEqual(2000);
  });

  it("does not initialize twice", async () => {
    const { initErrorCapture } = await import("./error-capture");
    const addEventListenerSpy = vi.spyOn(window, "addEventListener");
    initErrorCapture();
    initErrorCapture(); // second call should be no-op
    // Should only have been called twice (once for error, once for unhandledrejection)
    expect(addEventListenerSpy).toHaveBeenCalledTimes(2);
    addEventListenerSpy.mockRestore();
  });
});