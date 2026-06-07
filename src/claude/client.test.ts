import { describe, it, expect, vi } from "vitest";
import { constructQuery } from "./client.js";
import type { SchemaContext } from "../adapters/adapter.js";
import type { Message } from "@anthropic-ai/sdk/resources/messages";

const SCHEMA: SchemaContext = {
  sourceName: "customers",
  sourceType: "postgres",
  queryType: "sql",
  tables: [
    { name: "customers", rowCount: 10, columns: [{ name: "id", type: "number" }] },
  ],
};

function toolUseMessage(): Message {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-opus-4-8",
    content: [
      {
        type: "tool_use",
        id: "toolu_1",
        name: "execute_query",
        input: {
          query: "SELECT * FROM customers",
          query_type: "sql",
          reasoning: "All customers.",
        },
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
  } as Message;
}

// STORY-1.2.1 + 1.2.2 + 1.2.3 together: constructQuery wires schema → system
// prompt + execute_query tool + user question, then parses the tool_use block.
describe("constructQuery (FEAT-1.2)", () => {
  it("sends the schema, tool, and question, then returns the parsed query", async () => {
    const create = vi.fn().mockResolvedValue(toolUseMessage());
    const fakeClient = { messages: { create } } as never;

    const result = await constructQuery(fakeClient, {
      schema: SCHEMA,
      question: "Which customers do we have?",
    });

    expect(result.query).toBe("SELECT * FROM customers");
    expect(create).toHaveBeenCalledOnce();

    const params = create.mock.calls[0][0];
    // System prompt carries the schema.
    expect(JSON.stringify(params.system)).toContain("customers");
    // execute_query tool is offered (not describe_query) in default mode.
    expect(params.tools[0].name).toBe("execute_query");
    // The user's question is the user message.
    expect(JSON.stringify(params.messages)).toContain(
      "Which customers do we have?",
    );
  });

  it("offers describe_query and forbids execution in schema-only mode", async () => {
    const create = vi.fn().mockResolvedValue({
      ...toolUseMessage(),
      content: [
        {
          type: "tool_use",
          id: "toolu_2",
          name: "describe_query",
          input: { query: "SELECT 1", query_type: "sql", reasoning: "x" },
        },
      ],
    } as Message);
    const fakeClient = { messages: { create } } as never;

    await constructQuery(fakeClient, {
      schema: SCHEMA,
      question: "anything",
      schemaOnly: true,
    });

    const params = create.mock.calls[0][0];
    expect(params.tools[0].name).toBe("describe_query");
  });
});
