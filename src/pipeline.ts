import type Anthropic from "@anthropic-ai/sdk";
import type { DataSourceAdapter, Row, SchemaContext } from "./adapters/adapter.js";
import { constructQuery } from "./claude/client.js";
import { assertSelectOnly } from "./safety/sql.js";
import { redactSchemaForGovernance } from "./safety/schema-only.js";
import type { SchemaCache } from "./schema/cache.js";
import { shouldNarrow, narrowToRelevantTables } from "./schema/relevant.js";
import { selectRelevantTables } from "./schema/select-tables.js";

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
  /** Optional session schema cache; skips re-extraction on a hit (FEAT-5.2). */
  cache?: SchemaCache;
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
  const { adapter, claude, source, question, schemaOnly, dryRun, model, cache } =
    options;

  try {
    await adapter.connect(source);

    // Extract the full schema once per session: a cache hit (keyed by the
    // connection-string hash) skips re-extraction (backlog FEAT-5.2 / TC-034).
    const load = () => adapter.getSchema();
    const fullSchema: SchemaContext = cache
      ? await cache.getOrLoad(source, load)
      : await load();

    // For a large schema, ask Claude which tables are relevant and send only
    // those in detail; small schemas are sent whole (FEAT-5.2 / TC-035).
    let schema = fullSchema;
    if (shouldNarrow(fullSchema)) {
      const relevant = await selectRelevantTables(
        claude,
        fullSchema,
        question,
        model,
      );
      schema = narrowToRelevantTables(fullSchema, relevant);
    }

    if (schemaOnly) {
      schema = redactSchemaForGovernance(schema);
    }

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
