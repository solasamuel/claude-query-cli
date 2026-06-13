import { describe, it, expect } from "vitest";
import {
  narrowToRelevantTables,
  shouldNarrow,
  RELEVANCE_THRESHOLD,
} from "./relevant.js";
import type { SchemaContext } from "../adapters/adapter.js";

function bigSchema(tableCount: number): SchemaContext {
  return {
    sourceName: "warehouse",
    sourceType: "postgres",
    queryType: "sql",
    tables: Array.from({ length: tableCount }, (_, i) => ({
      name: `table_${i}`,
      columns: [{ name: "id", type: "number" as const }],
    })),
  };
}

// TC-035 / STORY-5.2.2: subsequent calls send only the relevant tables in
// detail; small schemas degrade gracefully (no narrowing).
describe("narrowToRelevantTables (TC-035 / STORY-5.2.2)", () => {
  it("keeps only the named tables", () => {
    const schema = bigSchema(200);
    const narrowed = narrowToRelevantTables(schema, ["table_5", "table_100"]);
    expect(narrowed.tables.map((t) => t.name)).toEqual([
      "table_5",
      "table_100",
    ]);
  });

  it("preserves source metadata and query type", () => {
    const schema = bigSchema(200);
    const narrowed = narrowToRelevantTables(schema, ["table_5"]);
    expect(narrowed.sourceName).toBe("warehouse");
    expect(narrowed.queryType).toBe("sql");
    expect(narrowed.sourceType).toBe("postgres");
  });

  it("ignores unknown table names without error", () => {
    const schema = bigSchema(10);
    const narrowed = narrowToRelevantTables(schema, ["table_1", "nope"]);
    expect(narrowed.tables.map((t) => t.name)).toEqual(["table_1"]);
  });

  it("falls back to the full schema when no names match (degrade gracefully)", () => {
    const schema = bigSchema(10);
    const narrowed = narrowToRelevantTables(schema, ["nonexistent"]);
    expect(narrowed.tables).toHaveLength(10);
  });

  it("returns the full schema for an empty relevant list", () => {
    const schema = bigSchema(10);
    const narrowed = narrowToRelevantTables(schema, []);
    expect(narrowed.tables).toHaveLength(10);
  });
});

describe("shouldNarrow (FEAT-5.2)", () => {
  it("narrows large schemas (above the threshold)", () => {
    expect(shouldNarrow(bigSchema(RELEVANCE_THRESHOLD + 1))).toBe(true);
  });

  it("does not narrow small schemas (at or below the threshold)", () => {
    expect(shouldNarrow(bigSchema(RELEVANCE_THRESHOLD))).toBe(false);
    expect(shouldNarrow(bigSchema(3))).toBe(false);
  });
});
