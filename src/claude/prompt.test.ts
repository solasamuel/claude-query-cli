import { describe, it, expect } from "vitest";
import { buildSystemPrompt, serializeSchema } from "./prompt.js";
import type { SchemaContext } from "../adapters/adapter.js";

const SQL_SCHEMA: SchemaContext = {
  sourceName: "customers",
  sourceType: "postgres",
  queryType: "sql",
  tables: [
    {
      name: "customers",
      rowCount: 1200,
      columns: [
        { name: "id", type: "number" },
        { name: "email", type: "string", sampleValues: ["a@x.com"] },
        {
          name: "country",
          type: "string",
          sampleValues: ["GB", "US", "FR"],
        },
      ],
    },
    {
      name: "orders",
      rowCount: 5400,
      columns: [
        { name: "id", type: "number" },
        {
          name: "customer_id",
          type: "number",
          references: { table: "customers", column: "id" },
        },
      ],
    },
  ],
};

describe("serializeSchema (TC-033 lite / STORY-5.1.1)", () => {
  it("renders human-readable text, not JSON", () => {
    const text = serializeSchema(SQL_SCHEMA);
    expect(() => JSON.parse(text)).toThrow();
    expect(text).toContain("customers");
    expect(text).toContain("orders");
    expect(text).toContain("country");
  });

  it("represents columns, types, and FK relationships", () => {
    const text = serializeSchema(SQL_SCHEMA);
    expect(text).toMatch(/country.*string/);
    expect(text).toContain("customers.id"); // the FK target
  });
});

// TC-005 / STORY-1.2.1: the system prompt is built from the formatted schema
// plus the SELECT-only safety instruction, and contains no raw row data
// beyond approved sample values.
describe("buildSystemPrompt (TC-005 / STORY-1.2.1)", () => {
  it("includes the formatted schema text", () => {
    const prompt = buildSystemPrompt(SQL_SCHEMA);
    expect(prompt).toContain("customers");
    expect(prompt).toContain("orders");
  });

  it("includes the SELECT-only safety instruction for SQL sources (TC-023)", () => {
    const prompt = buildSystemPrompt(SQL_SCHEMA);
    expect(prompt).toMatch(/SELECT/);
    for (const forbidden of [
      "INSERT",
      "UPDATE",
      "DELETE",
      "DROP",
      "ALTER",
      "CREATE",
      "TRUNCATE",
    ]) {
      expect(prompt).toContain(forbidden);
    }
  });

  it("omits the SQL safety instruction for non-SQL sources", () => {
    const notionSchema: SchemaContext = {
      ...SQL_SCHEMA,
      sourceType: "notion",
      queryType: "notion_filter",
    };
    const prompt = buildSystemPrompt(notionSchema);
    // No SQL DDL warning when the source can't run SQL.
    expect(prompt).not.toContain("TRUNCATE");
  });

  it("in schemaOnly mode, instructs Claude to describe not execute", () => {
    const prompt = buildSystemPrompt(SQL_SCHEMA, { schemaOnly: true });
    expect(prompt.toLowerCase()).toContain("describe");
  });
});
