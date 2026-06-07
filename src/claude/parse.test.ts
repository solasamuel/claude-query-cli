import { describe, it, expect } from "vitest";
import { extractToolQuery, NoToolUseError } from "./parse.js";
import type { Message } from "@anthropic-ai/sdk/resources/messages";

function messageWith(content: Message["content"]): Message {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-opus-4-8",
    content,
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

// TC-007 / STORY-1.2.3: detect the execute_query tool_use block and extract
// its query and reasoning.
describe("extractToolQuery (TC-007 / STORY-1.2.3)", () => {
  it("extracts query, query_type, and reasoning from a tool_use block", () => {
    const msg = messageWith([
      { type: "text", text: "Here is the query" },
      {
        type: "tool_use",
        id: "toolu_1",
        name: "execute_query",
        input: {
          query: "SELECT * FROM customers",
          query_type: "sql",
          reasoning: "Lists all customers.",
        },
      },
    ]);
    const result = extractToolQuery(msg, "execute_query");
    expect(result.query).toBe("SELECT * FROM customers");
    expect(result.query_type).toBe("sql");
    expect(result.reasoning).toBe("Lists all customers.");
  });

  it("matches the describe_query tool name in schema-only mode", () => {
    const msg = messageWith([
      {
        type: "tool_use",
        id: "toolu_2",
        name: "describe_query",
        input: {
          query: "SELECT 1",
          query_type: "sql",
          reasoning: "Trivial.",
        },
      },
    ]);
    const result = extractToolQuery(msg, "describe_query");
    expect(result.query).toBe("SELECT 1");
  });

  // TC-008 / STORY-1.2.3: a response with no tool_use block produces a clear error.
  it("throws NoToolUseError when there is no tool_use block", () => {
    const msg = messageWith([
      { type: "text", text: "I cannot help with that." },
    ]);
    expect(() => extractToolQuery(msg, "execute_query")).toThrow(NoToolUseError);
  });

  it("throws when the tool_use block is missing required fields", () => {
    const msg = messageWith([
      {
        type: "tool_use",
        id: "toolu_3",
        name: "execute_query",
        input: { query_type: "sql" }, // no query / reasoning
      },
    ]);
    expect(() => extractToolQuery(msg, "execute_query")).toThrow();
  });
});
