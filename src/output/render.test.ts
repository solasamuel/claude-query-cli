import { describe, it, expect } from "vitest";
import { renderOutput } from "./render.js";
import type { RunQueryResult } from "../pipeline.js";
import type { Row } from "../adapters/adapter.js";

const baseResult = (over: Partial<RunQueryResult> = {}): RunQueryResult => ({
  query: "SELECT id FROM customers",
  reasoning: "Lists customer ids.",
  queryType: "sql",
  executed: true,
  rows: [{ id: 1 }, { id: 2 }],
  ...over,
});

// TC-027 / STORY-4.2.1: --explain prints reasoning before the results;
// without it, reasoning is captured but not printed.
describe("renderOutput explain (TC-027 / STORY-4.2.1)", () => {
  it("prints reasoning before the query when explain is on", () => {
    const out = renderOutput(baseResult(), {
      output: "table",
      limit: 100,
      explain: true,
    });
    const reasoningIdx = out.indexOf("Lists customer ids.");
    const queryIdx = out.indexOf("SELECT id FROM customers");
    expect(reasoningIdx).toBeGreaterThanOrEqual(0);
    expect(reasoningIdx).toBeLessThan(queryIdx);
  });

  it("omits reasoning text when explain is off", () => {
    const out = renderOutput(baseResult(), {
      output: "table",
      limit: 100,
      explain: false,
    });
    expect(out).not.toContain("Lists customer ids.");
  });
});

// The constructed query is always shown before results (NOTE: "always show the query").
describe("renderOutput always shows the query", () => {
  it("includes the constructed query and its type", () => {
    const out = renderOutput(baseResult(), {
      output: "json",
      limit: 100,
      explain: false,
    });
    expect(out).toContain("SELECT id FROM customers");
    expect(out).toContain("sql");
  });
});

// TC-028 / STORY-4.2.2: --limit caps rows and indicates truncation.
describe("renderOutput limit (TC-028 / STORY-4.2.2)", () => {
  it("caps rows to the limit and indicates truncation", () => {
    const rows: Row[] = Array.from({ length: 50 }, (_, i) => ({ id: i + 1 }));
    const out = renderOutput(baseResult({ rows }), {
      output: "json",
      limit: 5,
      explain: false,
    });
    // Find the JSON block and confirm only 5 rows were emitted.
    const arr = JSON.parse(out.slice(out.indexOf("[")));
    expect(arr).toHaveLength(5);
    expect(out.toLowerCase()).toMatch(/showing 5 of 50|truncated/);
  });

  it("does not indicate truncation when under the limit", () => {
    const out = renderOutput(baseResult(), {
      output: "json",
      limit: 100,
      explain: false,
    });
    expect(out.toLowerCase()).not.toMatch(/truncated/);
  });
});

// TC-026 / STORY-4.1.1: dry-run shows the query and does not render results.
describe("renderOutput dry-run / schema-only (TC-026 / STORY-4.1.1)", () => {
  it("shows the query and a not-executed note for dry-run", () => {
    const out = renderOutput(baseResult({ executed: false, rows: undefined }), {
      output: "table",
      limit: 100,
      explain: false,
      mode: "dry-run",
    });
    expect(out).toContain("SELECT id FROM customers");
    expect(out.toLowerCase()).toContain("dry-run");
    expect(out.toLowerCase()).toContain("not executed");
    // No results section.
    expect(out.toLowerCase()).not.toContain("results (");
  });

  it("notes schema-only mode without executing", () => {
    const out = renderOutput(baseResult({ executed: false, rows: undefined }), {
      output: "table",
      limit: 100,
      explain: false,
      mode: "schema-only",
    });
    expect(out.toLowerCase()).toContain("schema-only");
    expect(out.toLowerCase()).toContain("not executed");
  });
});

describe("renderOutput results section", () => {
  it("formats executed rows with the chosen formatter", () => {
    const out = renderOutput(baseResult(), {
      output: "markdown",
      limit: 100,
      explain: false,
    });
    expect(out).toContain("| id |");
    expect(out.toLowerCase()).toContain("results (2");
  });
});
