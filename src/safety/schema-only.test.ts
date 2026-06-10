import { describe, it, expect, vi } from "vitest";
import { redactSchemaForGovernance, containsRowData } from "./schema-only.js";
import { constructQuery } from "../claude/client.js";
import { serializeSchema } from "../claude/prompt.js";
import type { SchemaContext } from "../adapters/adapter.js";
import type { Message } from "@anthropic-ai/sdk/resources/messages";

// Schema with recognisable sentinel sample values, to prove they never leave.
const SENTINEL = "SENTINEL_ROW_VALUE_42";
const schemaWithSamples: SchemaContext = {
  sourceName: "customers",
  sourceType: "postgres",
  queryType: "sql",
  tables: [
    {
      name: "customers",
      rowCount: 1200,
      columns: [
        { name: "id", type: "number", sampleValues: [1, 2, 3] },
        {
          name: "email",
          type: "string",
          sampleValues: [SENTINEL, "b@x.com"],
          min: SENTINEL,
          max: "z@x.com",
        },
      ],
    },
  ],
};

// TC-025 / STORY-3.3.2: in schema-only mode no row data (sample values / ranges)
// is transmitted.
describe("redactSchemaForGovernance (TC-025 / STORY-3.3.2)", () => {
  it("strips sample values and min/max from every column", () => {
    const redacted = redactSchemaForGovernance(schemaWithSamples);
    for (const col of redacted.tables[0].columns) {
      expect(col.sampleValues).toBeUndefined();
      expect(col.min).toBeUndefined();
      expect(col.max).toBeUndefined();
    }
  });

  it("preserves structural schema (names, types, row counts, FKs)", () => {
    const redacted = redactSchemaForGovernance(schemaWithSamples);
    const t = redacted.tables[0];
    expect(t.name).toBe("customers");
    expect(t.rowCount).toBe(1200);
    expect(t.columns.map((c) => c.name)).toEqual(["id", "email"]);
    expect(t.columns[1].type).toBe("string");
  });

  it("the serialised redacted schema contains no sentinel row value", () => {
    const text = serializeSchema(redactSchemaForGovernance(schemaWithSamples));
    expect(text).not.toContain(SENTINEL);
    expect(containsRowData(text, schemaWithSamples)).toBe(false);
  });
});

function describeQueryMessage(): Message {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-opus-4-8",
    content: [
      {
        type: "tool_use",
        id: "toolu_1",
        name: "describe_query",
        input: {
          query: "SELECT id, email FROM customers",
          query_type: "sql",
          reasoning: "Would list customers.",
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

// TC-024 / STORY-3.3.1: schema-only swaps to describe_query and never executes;
// TC-025: the outbound payload carries no sentinel row data.
describe("constructQuery in schema-only mode (TC-024 / TC-025)", () => {
  it("offers describe_query and sends a redacted, data-free payload", async () => {
    const create = vi.fn().mockResolvedValue(describeQueryMessage());
    const fakeClient = { messages: { create } } as never;

    const result = await constructQuery(fakeClient, {
      schema: redactSchemaForGovernance(schemaWithSamples),
      question: "Which customers churned?",
      schemaOnly: true,
    });

    expect(result.query).toBe("SELECT id, email FROM customers");
    const params = create.mock.calls[0][0];
    // describe_query, not execute_query.
    expect(params.tools[0].name).toBe("describe_query");
    // No sentinel row value anywhere in the outbound request.
    expect(JSON.stringify(params)).not.toContain(SENTINEL);
  });
});
