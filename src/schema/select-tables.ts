import type Anthropic from "@anthropic-ai/sdk";
import type { Tool } from "@anthropic-ai/sdk/resources/messages";
import type { SchemaContext } from "../adapters/adapter.js";

export const SELECT_TABLES_TOOL_NAME = "select_tables";
const MAX_TOKENS = 1024;
const DEFAULT_MODEL = "claude-opus-4-8";

function buildSelectTablesTool(): Tool {
  return {
    name: SELECT_TABLES_TOOL_NAME,
    description:
      "Report which tables are relevant to answering the user's question.",
    input_schema: {
      type: "object",
      properties: {
        relevant_tables: {
          type: "array",
          items: { type: "string" },
          description:
            "The names of the tables needed to answer the question.",
        },
      },
      required: ["relevant_tables"],
    },
  };
}

/**
 * For a large schema, ask Claude which tables are relevant to the question,
 * sending only a lightweight list of table names (no columns or data). The
 * caller then narrows the full schema to these tables before the real query.
 * (Backlog FEAT-5.2 / STORY-5.2.2.)
 *
 * Returns the selected table names (possibly empty, in which case the caller
 * falls back to the full schema).
 */
export async function selectRelevantTables(
  client: Anthropic,
  schema: SchemaContext,
  question: string,
  model: string = DEFAULT_MODEL,
): Promise<string[]> {
  const tableList = schema.tables.map((t) => `- ${t.name}`).join("\n");
  const system =
    `The data source "${schema.sourceName}" has these tables:\n${tableList}\n\n` +
    "Use the tool to report which of these tables are needed to answer the question.";

  const message = await client.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    system,
    tools: [buildSelectTablesTool()],
    tool_choice: { type: "tool", name: SELECT_TABLES_TOOL_NAME },
    messages: [{ role: "user", content: question }],
  });

  const block = message.content.find(
    (b) => b.type === "tool_use" && b.name === SELECT_TABLES_TOOL_NAME,
  );
  if (!block || block.type !== "tool_use") return [];

  const input = block.input as { relevant_tables?: unknown };
  if (!Array.isArray(input.relevant_tables)) return [];

  return input.relevant_tables.filter(
    (t): t is string => typeof t === "string",
  );
}
