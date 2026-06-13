import { describe, it, expect, vi } from "vitest";
import { selectRelevantTables } from "./select-tables.js";
import type { SchemaContext } from "../adapters/adapter.js";
import type { Message } from "@anthropic-ai/sdk/resources/messages";

function schema(n: number): SchemaContext {
  return {
    sourceName: "wh",
    sourceType: "postgres",
    queryType: "sql",
    tables: Array.from({ length: n }, (_, i) => ({
      name: `table_${i}`,
      columns: [{ name: "id", type: "number" as const }],
    })),
  };
}

function claudeReturning(tables: string[]): { messages: { create: any } } {
  const create = vi.fn().mockResolvedValue({
    id: "m",
    type: "message",
    role: "assistant",
    model: "claude-opus-4-8",
    content: [
      {
        type: "tool_use",
        id: "toolu_1",
        name: "select_tables",
        input: { relevant_tables: tables },
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

// TC-035 / STORY-5.2.2: ask Claude which tables are relevant given the question.
describe("selectRelevantTables (TC-035 / STORY-5.2.2)", () => {
  it("returns the table names Claude selects", async () => {
    const claude = claudeReturning(["table_5", "table_9"]);
    const names = await selectRelevantTables(
      claude as never,
      schema(200),
      "which rows are in table 5 and 9?",
    );
    expect(names).toEqual(["table_5", "table_9"]);
  });

  it("sends a lightweight table list (names only) to Claude", async () => {
    const claude = claudeReturning(["table_5"]);
    await selectRelevantTables(claude as never, schema(50), "q");
    const params = (claude.messages.create as any).mock.calls[0][0];
    // The select_tables tool is offered.
    expect(params.tools[0].name).toBe("select_tables");
    // The question is included.
    expect(JSON.stringify(params.messages)).toContain("q");
  });

  it("returns an empty list when Claude selects none (caller falls back to full)", async () => {
    const claude = claudeReturning([]);
    const names = await selectRelevantTables(claude as never, schema(50), "q");
    expect(names).toEqual([]);
  });
});
