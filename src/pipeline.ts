import type Anthropic from "@anthropic-ai/sdk";
import type { DataSourceAdapter, Row } from "./adapters/adapter.js";
import { constructQuery } from "./claude/client.js";
import { assertSelectOnly } from "./safety/sql.js";
import { redactSchemaForGovernance } from "./safety/schema-only.js";

export interface RunQueryOptions {
  adapter: DataSourceAdapter;
  claude: Anthropic;
  /** The --source string; passed to adapter.connect() before querying. */
  source: string;
  question: string;
  /** --schema-only: describe, never execute, send no row data (FEAT-3.3). */
  schemaOnly: boolean;
  /** --dry-run: show the query, do not execute (FEAT-4.1). */
  dryRun: boolean;
  model?: string;
}

export interface RunQueryResult {
  query: string;
  reasoning: string;
  queryType: string;
  executed: boolean;
  rows?: Row[];
}

/**
 * The end-to-end run pipeline (EPIC-3 integration): resolve the schema (redacted
 * under --schema-only), ask Claude to construct the query, apply the SQL hard
 * safety gate for SQL sources, then execute unless dry-run / schema-only.
 *
 * The hard gate runs BEFORE any execution and AFTER Claude returns, so a
 * destructive query never reaches the adapter. The adapter is always
 * disconnected, even on error.
 */
export async function runQuery(options: RunQueryOptions): Promise<RunQueryResult> {
  const { adapter, claude, source, question, schemaOnly, dryRun, model } =
    options;

  try {
    await adapter.connect(source);
    const rawSchema = await adapter.getSchema();
    const schema = schemaOnly
      ? redactSchemaForGovernance(rawSchema)
      : rawSchema;

    const { query, query_type, reasoning } = await constructQuery(claude, {
      schema,
      question,
      schemaOnly,
      model,
    });

    // Hard safety gate: SQL sources must pass SELECT-only validation before any
    // execution path is even considered (backlog FEAT-3.1).
    if (query_type === "sql") {
      assertSelectOnly(query);
    }

    // schema-only and dry-run never execute.
    if (schemaOnly || dryRun) {
      return { query, reasoning, queryType: query_type, executed: false };
    }

    const rows = await adapter.executeQuery(query);
    return { query, reasoning, queryType: query_type, executed: true, rows };
  } finally {
    await adapter.disconnect();
  }
}
