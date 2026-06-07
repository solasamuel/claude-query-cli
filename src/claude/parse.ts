import type { Message } from "@anthropic-ai/sdk/resources/messages";
import type { QueryType } from "../adapters/adapter.js";
import type { ExecuteQueryInput } from "./tool.js";

const QUERY_TYPES: QueryType[] = [
  "sql",
  "notion_filter",
  "airtable_formula",
  "json_path",
];

/** Raised when Claude's response contains no usable tool_use block (TC-008). */
export class NoToolUseError extends Error {
  constructor(toolName: string) {
    super(
      `Claude did not call the ${toolName} tool. It may have refused or asked for clarification.`,
    );
    this.name = "NoToolUseError";
  }
}

/** Raised when the tool_use block is present but malformed. */
export class InvalidToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidToolInputError";
  }
}

function isQueryType(value: unknown): value is QueryType {
  return typeof value === "string" && (QUERY_TYPES as string[]).includes(value);
}

/**
 * Find the named tool_use block in Claude's response and extract its validated
 * input. Throws NoToolUseError if absent, InvalidToolInputError if malformed.
 * (TC-007 / TC-008 / STORY-1.2.3.)
 */
export function extractToolQuery(
  message: Message,
  toolName: string,
): ExecuteQueryInput {
  const block = message.content.find(
    (b) => b.type === "tool_use" && b.name === toolName,
  );

  if (!block || block.type !== "tool_use") {
    throw new NoToolUseError(toolName);
  }

  const input = block.input as Record<string, unknown>;

  if (typeof input.query !== "string" || input.query.trim() === "") {
    throw new InvalidToolInputError(
      `Tool ${toolName} returned no "query" string.`,
    );
  }
  if (!isQueryType(input.query_type)) {
    throw new InvalidToolInputError(
      `Tool ${toolName} returned an invalid "query_type": ${String(
        input.query_type,
      )}.`,
    );
  }
  if (typeof input.reasoning !== "string") {
    throw new InvalidToolInputError(
      `Tool ${toolName} returned no "reasoning" string.`,
    );
  }

  return {
    query: input.query,
    query_type: input.query_type,
    reasoning: input.reasoning,
  };
}
