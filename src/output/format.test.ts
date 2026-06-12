import { describe, it, expect } from "vitest";
import { formatRows } from "./format.js";
import type { Row } from "../adapters/adapter.js";

const ROWS: Row[] = [
  { name: "Alice", email: "alice@example.com", score: 9.5 },
  { name: "Bob", email: "bob@example.com", score: 7.2 },
];

// TC-029 / STORY-4.3.1: table output (default) renders headers and rows;
// empty sets render a clear "no rows" message.
describe("formatRows table (TC-029 / STORY-4.3.1)", () => {
  it("renders headers and row values", () => {
    const out = formatRows(ROWS, "table");
    expect(out).toContain("name");
    expect(out).toContain("email");
    expect(out).toContain("Alice");
    expect(out).toContain("bob@example.com");
  });

  it("renders a clear message for an empty result set", () => {
    const out = formatRows([], "table");
    expect(out.toLowerCase()).toContain("no rows");
  });
});

// TC-030 / STORY-4.3.2: JSON output is a valid, parseable array, no table chrome.
describe("formatRows json (TC-030 / STORY-4.3.2)", () => {
  it("emits a valid JSON array of objects", () => {
    const out = formatRows(ROWS, "json");
    const parsed = JSON.parse(out);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toEqual(ROWS);
  });

  it("does not include table border characters", () => {
    const out = formatRows(ROWS, "json");
    expect(out).not.toMatch(/[┌┐└┘│─]/);
  });

  it("emits [] for an empty set", () => {
    expect(JSON.parse(formatRows([], "json"))).toEqual([]);
  });
});

// TC-031 / STORY-4.3.3: CSV output has headers and escapes special characters.
describe("formatRows csv (TC-031 / STORY-4.3.3)", () => {
  it("emits a header row followed by data rows", () => {
    const out = formatRows(ROWS, "csv");
    const lines = out.trim().split("\n");
    expect(lines[0]).toBe("name,email,score");
    expect(lines).toHaveLength(3); // header + 2 rows
  });

  it("escapes values containing commas and quotes", () => {
    const tricky: Row[] = [
      { note: 'has, comma', quote: 'say "hi"' },
    ];
    const out = formatRows(tricky, "csv");
    expect(out).toContain('"has, comma"');
    expect(out).toContain('"say ""hi"""');
  });

  it("emits just a header for an empty set with known columns is not possible — emits empty", () => {
    expect(formatRows([], "csv").trim()).toBe("");
  });
});

// TC-032 / STORY-4.3.4: Markdown output is a valid GFM table with separator row.
describe("formatRows markdown (TC-032 / STORY-4.3.4)", () => {
  it("emits a GFM table with header and alignment separator", () => {
    const out = formatRows(ROWS, "markdown");
    const lines = out.trim().split("\n");
    expect(lines[0]).toBe("| name | email | score |");
    expect(lines[1]).toMatch(/^\|\s*---\s*\|\s*---\s*\|\s*---\s*\|$/);
    expect(lines[2]).toContain("Alice");
  });

  it("renders a message for an empty result set", () => {
    expect(formatRows([], "markdown").toLowerCase()).toContain("no rows");
  });
});
