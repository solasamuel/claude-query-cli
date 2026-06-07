import type Anthropic from "@anthropic-ai/sdk";
import type { SchemaContext } from "../adapters/adapter.js";
import type { ExecuteQueryInput } from "./tool.js";
import {
  buildExecuteQueryTool,
  buildDescribeQueryTool,
  EXECUTE_QUERY_TOOL_NAME,
  DESCRIBE_QUERY_TOOL_NAME,
} from "./tool.js";
import { buildSystemPrompt } from "./prompt.js";
import { extractToolQuery } from "./parse.js";

/** Default model — the most capable Claude model (see claude-api skill). */
export const DEFAULT_MODEL = "claude-opus-4-8";
const MAX_TOKENS = 4096;

export interface ConstructQueryOptions {
  schema: SchemaContext;
  question: string;
  /** --schema-only: use describe_query and never execute (backlog FEAT-3.3). */
  schemaOnly?: boolean;
  model?: string;
}

/**
 * The core tool-use call (FEAT-1.2): build the schema-first system prompt and
 * the execute_query (or describe_query) tool, send the user's question, and
 * parse the tool_use block Claude returns.
 *
 * The Anthropic client is injected so the orchestration is unit-testable
 * without hitting the live API.
 */
export async function constructQuery(
  client: Anthropic,
  options: ConstructQueryOptions,
): Promise<ExecuteQueryInput> {
  const { schema, question, schemaOnly = false, model = DEFAULT_MODEL } = options;

  const tool = schemaOnly
    ? buildDescribeQueryTool()
    : buildExecuteQueryTool();
  const toolName = schemaOnly
    ? DESCRIBE_QUERY_TOOL_NAME
    : EXECUTE_QUERY_TOOL_NAME;

  const message = await client.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    system: buildSystemPrompt(schema, { schemaOnly }),
    tools: [tool],
    tool_choice: { type: "tool", name: toolName },
    messages: [{ role: "user", content: question }],
  });

  return extractToolQuery(message, toolName);
}
