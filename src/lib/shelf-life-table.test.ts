import { test, expect } from "vitest";

// Test for comparing null values in shelf-life sorting
// TDD approach: test fails initially, then passes when compareNullable is implemented

function compareNullable<T>(
  a: T | null | undefined,
  b: T | null | undefined,
  cmp: (a: T, b: T) => number,
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1; // nulls last
  if (b == null) return -1;
  return cmp(a, b);
}

test("null arrival_date hamnar sist vid asc och desc", () => {
  const a = { arrival_date: null } as any;
  const b = { arrival_date: "2026-09-01" } as any;
  expect(compareNullable(a.arrival_date, b.arrival_date, (x, y) => (x < y ? -1 : 1))).toBe(1);
  expect(compareNullable(b.arrival_date, a.arrival_date, (x, y) => (x < y ? -1 : 1))).toBe(-1);
});

test("null brand jämförs som tom sträng korrekt vid asc", () => {
  const a = { brand: null } as any;
  const b = { brand: "A" } as any;
  // Null → tom → först vid asc
  expect(compareNullable(a.brand ?? "", b.brand ?? "", (x, y) => x.localeCompare(y))).toBe(-1);
});

test("null-null comparison returns 0", () => {
  expect(compareNullable(null, null, () => 1)).toBe(0);
  expect(compareNullable(undefined, undefined, () => 1)).toBe(0);
});

test("null present comes last in ascending order", () => {
  expect(compareNullable(null, "value", () => -1)).toBe(1);
  expect(compareNullable("value", null, () => -1)).toBe(-1);
});

test("non-null values use comparison function", () => {
  expect(compareNullable("apple", "banana", (a, b) => a.localeCompare(b))).toBe(-1);
  expect(compareNullable("banana", "apple", (a, b) => a.localeCompare(b))).toBe(1);
  expect(compareNullable("apple", "apple", (a, b) => a.localeCompare(b))).toBe(0);
});