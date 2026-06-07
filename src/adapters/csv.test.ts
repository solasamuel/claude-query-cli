import { describe, it, expect } from "vitest";
import { CsvAdapter } from "./csv.js";

const CSV = `name,age,active,signup_date,score
Alice,30,true,2026-01-15,9.5
Bob,25,false,2026-02-20,7.2
Carol,42,true,2026-03-01,8.8
Dave,25,true,2026-01-30,6.1`;

async function loadAdapter(csv = CSV): Promise<CsvAdapter> {
  const adapter = new CsvAdapter();
  // connect accepts inline CSV via a data: URL for testing without the filesystem.
  await adapter.connect(`data:text/csv,${encodeURIComponent(csv)}`);
  return adapter;
}

// TC-013 / STORY-2.2.1: parse CSV and infer schema (types, min/max, samples, count).
describe("CsvAdapter.getSchema (TC-013 / STORY-2.2.1)", () => {
  it("exposes a single table with the inferred columns", async () => {
    const adapter = await loadAdapter();
    const schema = await adapter.getSchema();
    expect(schema.sourceType).toBe("csv");
    expect(schema.queryType).toBe("json_path");
    expect(schema.tables).toHaveLength(1);
    const cols = schema.tables[0].columns.map((c) => c.name);
    expect(cols).toEqual(["name", "age", "active", "signup_date", "score"]);
  });

  it("infers string / number / boolean / date types", async () => {
    const adapter = await loadAdapter();
    const { columns } = (await adapter.getSchema()).tables[0];
    const byName = Object.fromEntries(columns.map((c) => [c.name, c.type]));
    expect(byName.name).toBe("string");
    expect(byName.age).toBe("number");
    expect(byName.active).toBe("boolean");
    expect(byName.signup_date).toBe("date");
    expect(byName.score).toBe("number");
  });

  it("captures row count and min/max for numeric columns", async () => {
    const adapter = await loadAdapter();
    const table = (await adapter.getSchema()).tables[0];
    expect(table.rowCount).toBe(4);
    const age = table.columns.find((c) => c.name === "age")!;
    expect(age.min).toBe(25);
    expect(age.max).toBe(42);
  });

  it("captures up to 5 distinct sample values per column", async () => {
    const adapter = await loadAdapter();
    const table = (await adapter.getSchema()).tables[0];
    const age = table.columns.find((c) => c.name === "age")!;
    // distinct ages are 30, 25, 42 → 3 samples
    expect(new Set(age.sampleValues)).toEqual(new Set([30, 25, 42]));
    expect(age.sampleValues!.length).toBeLessThanOrEqual(5);
  });
});

// TC-014 / STORY-2.2.2: execute queries by filtering the parsed array in-memory.
describe("CsvAdapter.executeQuery (TC-014 / STORY-2.2.2)", () => {
  it("applies an equality predicate to the parsed rows", async () => {
    const adapter = await loadAdapter();
    const rows = await adapter.executeQuery(
      JSON.stringify({ where: [{ field: "active", op: "eq", value: true }] }),
    );
    expect(rows.map((r) => r.name)).toEqual(["Alice", "Carol", "Dave"]);
  });

  it("applies a numeric comparison predicate", async () => {
    const adapter = await loadAdapter();
    const rows = await adapter.executeQuery(
      JSON.stringify({ where: [{ field: "age", op: "gt", value: 28 }] }),
    );
    expect(rows.map((r) => r.name)).toEqual(["Alice", "Carol"]);
  });

  it("supports AND of multiple predicates, sort, and limit", async () => {
    const adapter = await loadAdapter();
    const rows = await adapter.executeQuery(
      JSON.stringify({
        where: [
          { field: "active", op: "eq", value: true },
          { field: "age", op: "lt", value: 40 },
        ],
        sort: { field: "age", direction: "asc" },
        limit: 1,
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Dave"); // age 25, active, < 40
  });

  it("returns all rows for an empty filter", async () => {
    const adapter = await loadAdapter();
    const rows = await adapter.executeQuery(JSON.stringify({}));
    expect(rows).toHaveLength(4);
  });
});
