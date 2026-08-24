import { describe, it, expect, beforeEach, vi } from "vitest";
import { enqueue, dequeueAll, getQueueLength, clearQueue, type QueuedOp } from "./offline-queue";

const getRawQueue = () =>
  JSON.parse(localStorage.getItem("sf-offline-queue") ?? "[]") as QueuedOp[];

describe("offline-queue", () => {
  beforeEach(() => {
    localStorage.clear();
    clearQueue();
  });

  it("enqueues items and reports length", () => {
    enqueue({ fn: "incidents.insert", args: { title: "x" }, timestamp: 1, retryCount: 0 });
    expect(getQueueLength()).toBe(1);
    const raw = getRawQueue();
    expect(raw.length).toBe(1);
    expect(raw[0].fn).toBe("incidents.insert");
    expect(raw[0].args).toEqual({ title: "x" });
    expect(raw[0].timestamp).toBe(1);
    expect(raw[0].retryCount).toBe(0);
  });

  it("enqueues multiple items in FIFO order", () => {
    enqueue({ fn: "first", args: { a: 1 }, timestamp: 100, retryCount: 0 });
    enqueue({ fn: "second", args: { b: 2 }, timestamp: 200, retryCount: 0 });
    enqueue({ fn: "third", args: { c: 3 }, timestamp: 300, retryCount: 0 });

    const raw = getRawQueue();
    expect(raw.length).toBe(3);
    expect(raw[0].fn).toBe("first");
    expect(raw[1].fn).toBe("second");
    expect(raw[2].fn).toBe("third");
    // Verify timestamps preserved
    expect(raw[0].timestamp).toBe(100);
    expect(raw[1].timestamp).toBe(200);
    expect(raw[2].timestamp).toBe(300);
  });

  it("preserves complex args through JSON serialization", () => {
    const complexArgs = {
      nested: { arr: [1, 2, 3], str: "hello" },
      date: new Date("2024-01-15").toISOString(),
      nullVal: null,
      bool: true,
    };
    enqueue({ fn: "complex", args: complexArgs, timestamp: Date.now(), retryCount: 0 });

    const raw = getRawQueue();
    expect(raw[0].args).toEqual(complexArgs);
  });

  it("dequeueAll returns items in FIFO order and clears queue", () => {
    enqueue({ fn: "a", args: {}, timestamp: 1, retryCount: 0 });
    enqueue({ fn: "b", args: {}, timestamp: 2, retryCount: 0 });
    enqueue({ fn: "c", args: {}, timestamp: 3, retryCount: 0 });

    const all = dequeueAll();
    expect(all.length).toBe(3);
    expect(all[0].fn).toBe("a");
    expect(all[1].fn).toBe("b");
    expect(all[2].fn).toBe("c");
    expect(getQueueLength()).toBe(0);
    expect(getRawQueue().length).toBe(0);
  });

  it("dequeueAll on empty queue returns empty array", () => {
    const all = dequeueAll();
    expect(all).toEqual([]);
    expect(getQueueLength()).toBe(0);
  });

  it("survives reload (localStorage persistence)", () => {
    enqueue({ fn: "a", args: { foo: "bar" }, timestamp: 12345, retryCount: 0 });
    // simulate reload: re-import module state is fresh, but localStorage persists
    const raw = JSON.parse(localStorage.getItem("sf-offline-queue") ?? "[]") as QueuedOp[];
    expect(raw.length).toBe(1);
    expect(raw[0].fn).toBe("a");
    expect(raw[0].args).toEqual({ foo: "bar" });
    expect(raw[0].timestamp).toBe(12345);
    expect(raw[0].retryCount).toBe(0);
  });

  it("clearQueue removes all items", () => {
    enqueue({ fn: "a", args: {}, timestamp: 1, retryCount: 0 });
    enqueue({ fn: "b", args: {}, timestamp: 2, retryCount: 0 });
    clearQueue();
    expect(getQueueLength()).toBe(0);
    expect(getRawQueue()).toEqual([]);
  });

  it("handles corrupted localStorage gracefully", () => {
    localStorage.setItem("sf-offline-queue", "not valid json");
    // Should not throw, returns empty queue
    expect(getQueueLength()).toBe(0);
    const all = dequeueAll();
    expect(all).toEqual([]);
  });

  it("retryCount is stored and available for retry logic", () => {
    enqueue({ fn: "retry.me", args: {}, timestamp: 1, retryCount: 2 });
    const raw = getRawQueue();
    expect(raw[0].retryCount).toBe(2);
    // After dequeue, the item retains its retryCount for the caller to increment
    const dequeued = dequeueAll();
    expect(dequeued[0].retryCount).toBe(2);
  });
});
