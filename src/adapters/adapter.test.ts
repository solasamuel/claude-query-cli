import { describe, it, expect } from "vitest";
import type { DataSourceAdapter, SchemaContext, Row } from "./adapter.js";

// A minimal in-memory adapter used purely to prove the interface contract.
// TC-009: every adapter must expose name, connect, getSchema, executeQuery,
// disconnect; getSchema returns a SchemaContext; executeQuery returns Row[].
class StubAdapter implements DataSourceAdapter {
  readonly name = "stub";
  connected = false;

  async connect(_connectionString: string): Promise<void> {
    this.connected = true;
  }

  async getSchema(): Promise<SchemaContext> {
    return {
      sourceName: "stub",
      sourceType: "json",
      queryType: "json_path",
      tables: [
        {
          name: "items",
          rowCount: 2,
          columns: [
            { name: "id", type: "number", sampleValues: [1, 2] },
            { name: "label", type: "string", sampleValues: ["a", "b"] },
          ],
        },
      ],
    };
  }

  async executeQuery(_query: string): Promise<Row[]> {
    return [{ id: 1, label: "a" }];
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }
}

describe("DataSourceAdapter contract (TC-009 / STORY-1.3.1)", () => {
  it("exposes the required members", () => {
    const adapter = new StubAdapter();
    expect(typeof adapter.name).toBe("string");
    expect(typeof adapter.connect).toBe("function");
    expect(typeof adapter.getSchema).toBe("function");
    expect(typeof adapter.executeQuery).toBe("function");
    expect(typeof adapter.disconnect).toBe("function");
  });

  it("getSchema returns a SchemaContext", async () => {
    const adapter = new StubAdapter();
    const schema = await adapter.getSchema();
    expect(schema.tables).toHaveLength(1);
    expect(schema.tables[0].columns[0].name).toBe("id");
    expect(schema.queryType).toBe("json_path");
  });

  it("executeQuery returns Row[]", async () => {
    const adapter = new StubAdapter();
    const rows = await adapter.executeQuery("anything");
    expect(Array.isArray(rows)).toBe(true);
    expect(rows[0]).toEqual({ id: 1, label: "a" });
  });

  it("connect / disconnect toggle connection state", async () => {
    const adapter = new StubAdapter();
    await adapter.connect("conn://x");
    expect(adapter.connected).toBe(true);
    await adapter.disconnect();
    expect(adapter.connected).toBe(false);
  });
});
