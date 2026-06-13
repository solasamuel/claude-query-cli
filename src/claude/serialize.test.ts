import { describe, it, expect } from "vitest";
import { serializeSchema } from "./prompt.js";
import type { SchemaContext } from "../adapters/adapter.js";

const sqlSchema: SchemaContext = {
  sourceName: "shop",
  sourceType: "postgres",
  queryType: "sql",
  tables: [
    {
      name: "customers",
      rowCount: 1200,
      columns: [
        { name: "id", type: "number" },
        { name: "country", type: "string", sampleValues: ["GB", "US"] },
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

const notionSchema: SchemaContext = {
  sourceName: "Tasks",
  sourceType: "notion",
  queryType: "notion_filter",
  tables: [
    {
      name: "Tasks",
      columns: [
        { name: "Name", type: "string" },
        { name: "Status", type: "string", sampleValues: ["Active", "Done"] },
      ],
    },
  ],
};

// TC-033 / STORY-5.1.1: SchemaContext is serialised to human-readable text
// (not raw JSON), representing tables, columns, types, and relationships,
// via a shared renderer used across adapters.
describe("serializeSchema readable text (TC-033 / STORY-5.1.1)", () => {
  it("produces human-readable text, not parseable JSON", () => {
    const text = serializeSchema(sqlSchema);
    expect(() => JSON.parse(text)).toThrow();
    // No JSON object/array braces dominating the output.
    expect(text.trimStart().startsWith("{")).toBe(false);
    expect(text.trimStart().startsWith("[")).toBe(false);
  });

  it("represents every table, column, and type", () => {
    const text = serializeSchema(sqlSchema);
    for (const token of [
      "customers",
      "orders",
      "country",
      "customer_id",
      "string",
      "number",
    ]) {
      expect(text).toContain(token);
    }
  });

  it("represents foreign-key relationships in readable form", () => {
    const text = serializeSchema(sqlSchema);
    expect(text).toContain("customers.id"); // the FK target
    expect(text.toLowerCase()).toContain("references");
  });

  it("includes row counts when present", () => {
    const text = serializeSchema(sqlSchema);
    expect(text).toContain("1200");
    expect(text).toContain("5400");
  });

  it("is the same renderer for a non-SQL (Notion) source", () => {
    const text = serializeSchema(notionSchema);
    expect(text).toContain("Tasks");
    expect(text).toContain("Status");
    expect(text).toContain("Active");
    // Notion has no row counts here, and the renderer must not invent any.
    expect(() => JSON.parse(text)).toThrow();
  });
});
