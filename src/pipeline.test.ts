import { describe, it, expect, vi } from "vitest";
import { runQuery } from "./pipeline.js";
import { UnsafeQueryError } from "./safety/sql.js";
import type { DataSourceAdapter, SchemaContext, Row } from "./adapters/adapter.js";
import type { Message } from "@anthropic-ai/sdk/resources/messages";

const SENTINEL = "SENTINEL_SAMPLE_9000";

function fakeAdapter(
  queryType: SchemaContext["queryType"],
  rows: Row[] = [{ id: 1 }],
): DataSourceAdapter & {
  executeQuery: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
} {
  return {
    name: "fake",
    connect: vi.fn().mockResolvedValue(undefined),
    getSchema: vi.fn().mockResolvedValue({
      sourceName: "fake",
      sourceType: queryType === "sql" ? "postgres" : "json",
      queryType,
      tables: [
        {
          name: "t",
          rowCount: 3,
          columns: [
            { name: "id", type: "number", sampleValues: [SENTINEL] },
          ],
        },
      ],
    } as SchemaContext),
    executeQuery: vi.fn().mockResolvedValue(rows),
    disconnect: vi.fn().mockResolvedValue(undefined),
  };
}

function claudeReturning(
  name: string,
  query: string,
  queryType = "sql",
): { messages: { create: any } } {
  const create = vi.fn().mockResolvedValue({
    id: "m",
    type: "message",
    role: "assistant",
    model: "claude-opus-4-8",
    content: [
      {
        type: "tool_use",
        id: "toolu_1",
        name,
        input: { query, query_type: queryType, reasoning: "because" },
      },
    ],
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
  } as Message);
  return { messages: { create } };
}

describe("runQuery pipeline (EPIC-3 integration)", () => {
  it("executes a safe SELECT and returns rows", async () => {
    const adapter = fakeAdapter("sql", [{ id: 7, name: "Alice" }]);
    const claude = claudeReturning("execute_query", "SELECT id FROM t");

    const result = await runQuery({
      adapter,
      claude: claude as never,
      source: "fake://x",
      question: "list ids",
      schemaOnly: false,
      dryRun: false,
    });

    expect(result.query).toBe("SELECT id FROM t");
    expect(result.executed).toBe(true);
    expect(result.rows).toEqual([{ id: 7, name: "Alice" }]);
    expect(adapter.executeQuery).toHaveBeenCalledWith("SELECT id FROM t");
    expect(adapter.disconnect).toHaveBeenCalledOnce();
  });

  // The hard gate: a destructive query Claude somehow produced must NOT execute.
  it("rejects a non-SELECT query and never executes it (hard gate)", async () => {
    const adapter = fakeAdapter("sql");
    const claude = claudeReturning("execute_query", "DROP TABLE t");

    await expect(
      runQuery({
        adapter,
        claude: claude as never,
        source: "fake://x",
        question: "drop it",
        schemaOnly: false,
        dryRun: false,
      }),
    ).rejects.toThrow(UnsafeQueryError);

    expect(adapter.executeQuery).not.toHaveBeenCalled();
    expect(adapter.disconnect).toHaveBeenCalledOnce(); // still cleans up
  });

  // TC-026 (dry-run, EPIC-4 groundwork): show the query, do not execute.
  it("dry-run shows the query without executing", async () => {
    const adapter = fakeAdapter("sql");
    const claude = claudeReturning("execute_query", "SELECT id FROM t");

    const result = await runQuery({
      adapter,
      claude: claude as never,
      source: "fake://x",
      question: "list ids",
      schemaOnly: false,
      dryRun: true,
    });

    expect(result.query).toBe("SELECT id FROM t");
    expect(result.executed).toBe(false);
    expect(adapter.executeQuery).not.toHaveBeenCalled();
  });

  // TC-024 / TC-025: schema-only uses describe_query, never executes, sends no row data.
  it("schema-only describes without executing and redacts sample values", async () => {
    const adapter = fakeAdapter("sql");
    const claude = claudeReturning("describe_query", "SELECT id FROM t");

    const result = await runQuery({
      adapter,
      claude: claude as never,
      source: "fake://x",
      question: "what would you run",
      schemaOnly: true,
      dryRun: false,
    });

    expect(result.executed).toBe(false);
    expect(adapter.executeQuery).not.toHaveBeenCalled();

    // The system prompt sent to Claude carries no sentinel sample value.
    const params = (claude.messages.create as any).mock.calls[0][0];
    expect(JSON.stringify(params)).not.toContain(SENTINEL);
  });

  it("does not run the SQL gate for non-SQL sources", async () => {
    const adapter = fakeAdapter("notion_filter", [{ id: "page1" }]);
    // A notion_filter object is not SQL — the SQL gate must be skipped.
    const claude = claudeReturning(
      "execute_query",
      JSON.stringify({ filter: {} }),
      "notion_filter",
    );

    const result = await runQuery({
      adapter,
      claude: claude as never,
      source: "fake://x",
      question: "active tasks",
      schemaOnly: false,
      dryRun: false,
    });

    expect(result.executed).toBe(true);
    expect(adapter.executeQuery).toHaveBeenCalledOnce();
  });
});
