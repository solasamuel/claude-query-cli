import { describe, it, expect, vi } from "vitest";
import { runQuery } from "./pipeline.js";
import { SchemaCache } from "./schema/cache.js";
import type { DataSourceAdapter, SchemaContext, Row } from "./adapters/adapter.js";
import type { Message } from "@anthropic-ai/sdk/resources/messages";

function schemaWith(tableCount: number): SchemaContext {
  return {
    sourceName: "wh",
    sourceType: "postgres",
    queryType: "sql",
    tables: Array.from({ length: tableCount }, (_, i) => ({
      name: `table_${i}`,
      rowCount: 1,
      columns: [{ name: "id", type: "number" as const }],
    })),
  };
}

function fakeAdapter(schema: SchemaContext, rows: Row[] = [{ id: 1 }]) {
  return {
    name: "fake",
    connect: vi.fn().mockResolvedValue(undefined),
    getSchema: vi.fn().mockResolvedValue(schema),
    executeQuery: vi.fn().mockResolvedValue(rows),
    disconnect: vi.fn().mockResolvedValue(undefined),
  } satisfies DataSourceAdapter & Record<string, unknown>;
}

/**
 * A Claude double that answers select_tables with `relevant`, and
 * execute_query with a fixed SELECT. Records every create() call so we can
 * assert what schema was sent.
 */
function fakeClaude(relevant: string[]) {
  const create = vi.fn().mockImplementation((params: any) => {
    const toolName = params.tools?.[0]?.name;
    if (toolName === "select_tables") {
      return Promise.resolve(toolUse("select_tables", { relevant_tables: relevant }));
    }
    return Promise.resolve(
      toolUse("execute_query", {
        query: "SELECT id FROM table_5",
        query_type: "sql",
        reasoning: "x",
      }),
    );
  });
  return { messages: { create } };
}

function toolUse(name: string, input: unknown): Message {
  return {
    id: "m",
    type: "message",
    role: "assistant",
    model: "claude-opus-4-8",
    content: [{ type: "tool_use", id: "t", name, input }],
    stop_reason: "tool_use",
    stop_sequence: null,
    usage: {
      input_tokens: 1,
      output_tokens: 1,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      server_tool_use: null,
      service_tier: null,
    },
  } as Message;
}

// TC-034: a cache hit skips re-extraction across queries in one session.
describe("runQuery with SchemaCache (TC-034)", () => {
  it("extracts the schema once across two queries in the same session", async () => {
    const cache = new SchemaCache();
    const schema = schemaWith(3);
    const adapter1 = fakeAdapter(schema);
    const adapter2 = fakeAdapter(schema);
    const claude = fakeClaude([]);

    await runQuery({
      adapter: adapter1,
      claude: claude as never,
      source: "postgres://localhost/db",
      question: "q1",
      schemaOnly: false,
      dryRun: false,
      cache,
    });
    await runQuery({
      adapter: adapter2,
      claude: claude as never,
      source: "postgres://localhost/db",
      question: "q2",
      schemaOnly: false,
      dryRun: false,
      cache,
    });

    expect(adapter1.getSchema).toHaveBeenCalledOnce();
    expect(adapter2.getSchema).not.toHaveBeenCalled(); // served from cache
  });
});

// TC-035: a large schema triggers relevant-table selection; only named tables
// are sent in detail to the query-construction call.
describe("runQuery relevant-table narrowing (TC-035)", () => {
  it("asks Claude to select tables and narrows a large schema", async () => {
    const adapter = fakeAdapter(schemaWith(50));
    const claude = fakeClaude(["table_5"]);

    await runQuery({
      adapter,
      claude: claude as never,
      source: "postgres://localhost/db",
      question: "rows in table 5",
      schemaOnly: false,
      dryRun: false,
    });

    // Two Claude calls: select_tables, then execute_query.
    expect(claude.messages.create).toHaveBeenCalledTimes(2);
    const calls = (claude.messages.create as any).mock.calls;
    const selectCall = calls.find((c: any[]) => c[0].tools[0].name === "select_tables");
    const queryCall = calls.find((c: any[]) => c[0].tools[0].name === "execute_query");
    expect(selectCall).toBeDefined();

    // The query-construction system prompt contains only the narrowed table.
    const sys = JSON.stringify(queryCall[0].system);
    expect(sys).toContain("table_5");
    expect(sys).not.toContain("table_6");
  });

  it("does NOT narrow a small schema (single Claude call)", async () => {
    const adapter = fakeAdapter(schemaWith(3));
    const claude = fakeClaude(["table_1"]);

    await runQuery({
      adapter,
      claude: claude as never,
      source: "postgres://localhost/db",
      question: "q",
      schemaOnly: false,
      dryRun: false,
    });

    // Only execute_query — no select_tables round trip for a small schema.
    expect(claude.messages.create).toHaveBeenCalledOnce();
    expect((claude.messages.create as any).mock.calls[0][0].tools[0].name).toBe(
      "execute_query",
    );
  });
});
