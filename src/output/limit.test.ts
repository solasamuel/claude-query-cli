import { describe, it, expect } from "vitest";
import { applyLimit } from "./limit.js";
import type { Row } from "../adapters/adapter.js";

function makeRows(n: number): Row[] {
  return Array.from({ length: n }, (_, i) => ({ id: i + 1 }));
}

// TC-028 / STORY-4.2.2: --limit caps returned rows and indicates truncation.
describe("applyLimit (TC-028 / STORY-4.2.2)", () => {
  it("caps the rows to the limit", () => {
    const { rows, truncated, total } = applyLimit(makeRows(50), 5);
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.id)).toEqual([1, 2, 3, 4, 5]);
    expect(truncated).toBe(true);
    expect(total).toBe(50);
  });

  it("does not flag truncation when rows fit within the limit", () => {
    const { rows, truncated } = applyLimit(makeRows(3), 100);
    expect(rows).toHaveLength(3);
    expect(truncated).toBe(false);
  });

  it("flags no truncation when the count exactly equals the limit", () => {
    const { rows, truncated } = applyLimit(makeRows(10), 10);
    expect(rows).toHaveLength(10);
    expect(truncated).toBe(false);
  });

  it("handles an empty result set", () => {
    const { rows, truncated, total } = applyLimit([], 100);
    expect(rows).toEqual([]);
    expect(truncated).toBe(false);
    expect(total).toBe(0);
  });
});
