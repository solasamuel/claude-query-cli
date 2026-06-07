/**
 * The query language Claude must generate for a given data source. Drives the
 * `query_type` field of the execute_query tool and how the adapter interprets
 * the query string it receives. (Backlog FEAT-1.2 / STORY-1.2.2.)
 */
export type QueryType = "sql" | "notion_filter" | "airtable_formula" | "json_path";

/** The data-source families claude-query supports (backlog EPIC-2). */
export type SourceType = "postgres" | "csv" | "json" | "notion" | "airtable";

/** Inferred column scalar types used when describing a schema to Claude. */
export type ColumnType = "string" | "number" | "date" | "boolean";

/** An arbitrary result row. Keys are column/field names. */
export type Row = Record<string, unknown>;

/** Schema for a single column/field/property within a table. */
export interface ColumnSchema {
  name: string;
  type: ColumnType;
  /** Distinct sample values, to help Claude recognise enum-like fields. */
  sampleValues?: unknown[];
  /** Present for numeric/date columns where a range is meaningful. */
  min?: unknown;
  max?: unknown;
  /** Whether the column participates in a foreign-key relationship. */
  references?: { table: string; column: string };
}

/** Schema for a single table / collection / database. */
export interface TableSchema {
  name: string;
  columns: ColumnSchema[];
  /** Row count (never raw data) — omitted in strict schema-only contexts. */
  rowCount?: number;
}

/**
 * A structured description of a data source. Serialised to human-readable text
 * for the Claude system prompt — never sent as raw JSON. (Backlog FEAT-5.1.)
 */
export interface SchemaContext {
  sourceName: string;
  sourceType: SourceType;
  /** The query language Claude should generate for this source. */
  queryType: QueryType;
  tables: TableSchema[];
}

/**
 * The common contract every data source implements (backlog FEAT-1.3 /
 * STORY-1.3.1). The CLI, prompt builder, and formatters are all written
 * against this interface so the five sources are interchangeable.
 */
export interface DataSourceAdapter {
  /** Human-readable adapter name, e.g. "postgres". */
  readonly name: string;
  /** Establish a connection from a connection string / path / ID. */
  connect(connectionString: string): Promise<void>;
  /** Extract the schema to send to Claude. */
  getSchema(): Promise<SchemaContext>;
  /** Execute a validated query and return the result rows. */
  executeQuery(query: string): Promise<Row[]>;
  /** Release any open connection / resources. */
  disconnect(): Promise<void>;
}
