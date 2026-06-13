/**
 * claude-query — programmatic entry point.
 *
 * The primary interface is the `claude-query` CLI (see bin), but the building
 * blocks are exported here so the adapters, safety gate, schema handling, and
 * formatters can be reused as a library.
 */

// Core types and the adapter contract.
export type {
  DataSourceAdapter,
  SchemaContext,
  TableSchema,
  ColumnSchema,
  ColumnType,
  QueryType,
  SourceType,
  Row,
} from "./adapters/adapter.js";

// Adapters and resolution.
export { resolveAdapter, UnknownSourceError } from "./adapters/registry.js";
export { PostgresAdapter } from "./adapters/postgres.js";
export { CsvAdapter } from "./adapters/csv.js";
export { JsonAdapter } from "./adapters/json.js";
export { NotionAdapter } from "./adapters/notion.js";
export { AirtableAdapter } from "./adapters/airtable.js";

// Claude tool-use query construction.
export { constructQuery, DEFAULT_MODEL } from "./claude/client.js";
export { buildSystemPrompt, serializeSchema } from "./claude/prompt.js";

// Safety & governance.
export { assertSelectOnly, isSelectOnly, UnsafeQueryError } from "./safety/sql.js";
export {
  redactSchemaForGovernance,
  containsRowData,
} from "./safety/schema-only.js";

// Schema context & performance.
export { SchemaCache, connectionHash } from "./schema/cache.js";
export {
  narrowToRelevantTables,
  shouldNarrow,
} from "./schema/relevant.js";

// The end-to-end run pipeline.
export { runQuery } from "./pipeline.js";
export type { RunQueryOptions, RunQueryResult } from "./pipeline.js";

// Output formatting.
export { formatRows } from "./output/format.js";
export { applyLimit } from "./output/limit.js";
export { renderOutput } from "./output/render.js";
export { saveResults, FileExistsError } from "./output/save.js";

// Session features.
export { SessionHistory, defaultHistoryPath } from "./history/history.js";
