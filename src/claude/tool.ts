import type { Tool } from "@anthropic-ai/sdk/resources/messages";
import type { QueryType } from "../adapters/adapter.js";

export const EXECUTE_QUERY_TOOL_NAME = "execute_query";
export const DESCRIBE_QUERY_TOOL_NAME = "describe_query";

/** The four query languages Claude may generate, mirrored in the tool enum. */
const QUERY_TYPES: QueryType[] = [
  "sql",
  "notion_filter",
  "airtable_formula",
  "json_path",
];

/**
 * The structured output Claude returns via the execute_query / describe_query
 * tool. The architectural decision (FEAT-1.2) is to use tool use rather than
 * free-text SQL so query construction is reliable and type-safe.
 */
export interface ExecuteQueryInput {
  query: string;
  query_type: QueryType;
  reasoning: string;
}

function inputSchema() {
  return {
    type: "object" as const,
    properties: {
      query: {
        type: "string",
        description:
          "The SQL query, filter expression, or API parameters to execute against the data source.",
      },
      query_type: {
        type: "string",
        enum: [...QUERY_TYPES],
        description: "The type of query for the target data source.",
      },
      reasoning: {
        type: "string",
        description:
          "Brief explanation of why this query answers the user's question.",
      },
    },
    required: ["query", "query_type", "reasoning"],
  };
}

/**
 * The execute_query tool — Claude generates a query, the tool executes it.
 * (TC-006 / STORY-1.2.2.)
 */
export function buildExecuteQueryTool(): Tool {
  return {
    name: EXECUTE_QUERY_TOOL_NAME,
    description:
      "Execute a query against the data source and return results.",
    input_schema: inputSchema(),
  };
}

/**
 * The describe_query tool — same shape as execute_query, but Claude is asked to
 * describe the query it would run without it being executed. Used by
 * --schema-only mode so no actual data is ever touched. (Backlog FEAT-3.3.)
 */
export function buildDescribeQueryTool(): Tool {
  return {
    name: DESCRIBE_QUERY_TOOL_NAME,
    description:
      "Describe the query you would run to answer the question, without executing it.",
    input_schema: inputSchema(),
  };
}
