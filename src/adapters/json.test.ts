import { describe, it, expect } from "vitest";
import { JsonAdapter } from "./json.js";

const FLAT = JSON.stringify([
  { id: 1, name: "Alice", country: "GB" },
  { id: 2, name: "Bob", country: "US" },
]);

const NESTED = JSON.stringify([
  { id: 1, user: { name: "Alice", country: "GB" }, amount: 100 },
  { id: 2, user: { name: "Bob", country: "US" }, amount: 250 },
  { id: 3, user: { name: "Carol", country: "GB" }, amount: 75 },
]);

async function load(json: string): Promise<JsonAdapter> {
  const adapter = new JsonAdapter();
  await adapter.connect(`data:application/json,${encodeURIComponent(json)}`);
  return adapter;
}

// TC-015 / STORY-2.3.1: infer schema from flat and nested JSON, flattening
// nested paths with dot notation.
describe("JsonAdapter.getSchema (TC-015 / STORY-2.3.1)", () => {
  it("infers schema for a flat array of objects", async () => {
    const adapter = await load(FLAT);
    const schema = await adapter.getSchema();
    expect(schema.sourceType).toBe("json");
    expect(schema.queryType).toBe("json_path");
    const cols = schema.tables[0].columns.map((c) => c.name);
    expect(cols).toEqual(["id", "name", "country"]);
  });

  it("flattens nested object paths with dot notation", async () => {
    const adapter = await load(NESTED);
    const cols = (await adapter.getSchema()).tables[0].columns.map((c) => c.name);
    expect(cols).toContain("user.name");
    expect(cols).toContain("user.country");
    expect(cols).toContain("amount");
    expect(cols).not.toContain("user"); // the object itself is not a column
  });

  it("infers types on flattened columns", async () => {
    const adapter = await load(NESTED);
    const cols = (await adapter.getSchema()).tables[0].columns;
    const byName = Object.fromEntries(cols.map((c) => [c.name, c.type]));
    expect(byName["user.name"]).toBe("string");
    expect(byName["amount"]).toBe("number");
  });
});

// TC-016 / STORY-2.3.2: execute json_path filter resolving nested paths.
describe("JsonAdapter.executeQuery (TC-016 / STORY-2.3.2)", () => {
  it("filters on a nested dot-notation field", async () => {
    const adapter = await load(NESTED);
    const rows = await adapter.executeQuery(
      JSON.stringify({ where: [{ field: "user.country", op: "eq", value: "GB" }] }),
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.id)).toEqual([1, 3]);
  });

  it("filters on a top-level numeric field", async () => {
    const adapter = await load(NESTED);
    const rows = await adapter.executeQuery(
      JSON.stringify({ where: [{ field: "amount", op: "gte", value: 100 }] }),
    );
    expect(rows.map((r) => r.id)).toEqual([1, 2]);
  });

  it("handles a flat array unchanged", async () => {
    const adapter = await load(FLAT);
    const rows = await adapter.executeQuery(
      JSON.stringify({ where: [{ field: "country", op: "eq", value: "US" }] }),
    );
    expect(rows.map((r) => r.name)).toEqual(["Bob"]);
  });
});
