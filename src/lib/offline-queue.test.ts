import { describe, it, expect, beforeEach, vi } from "vitest";
import { enqueue, dequeueAll, getQueueLength, clearQueue } from "./offline-queue";

const getItem = () => JSON.parse(localStorage.getItem("sf-offline-queue") ?? "[]");

describe("offline-queue", () => {
  beforeEach(() => {
    localStorage.clear();
    clearQueue();
  });

  it("enqueues items and reports length", () => {
    enqueue({ fn: "incidents.insert", args: { title: "x" }, timestamp: 1, retryCount: 0 });
    expect(getQueueLength()).toBe(1);
    expect(getItem()[0].fn).toBe("incidents.insert");
  });

  it("dequeueAll returns and clears the queue", () => {
    enqueue({ fn: "a", args: {}, timestamp: 1, retryCount: 0 });
    enqueue({ fn: "b", args: {}, timestamp: 2, retryCount: 0 });
    const all = dequeueAll();
    expect(all.length).toBe(2);
    expect(getQueueLength()).toBe(0);
  });

  it("survives reload (localStorage persistence)", () => {
    enqueue({ fn: "a", args: {}, timestamp: 1, retryCount: 0 });
    // simulate reload: re-import module state is fresh, but localStorage persists
    const raw = JSON.parse(localStorage.getItem("sf-offline-queue") ?? "[]");
    expect(raw.length).toBe(1);
  });
});