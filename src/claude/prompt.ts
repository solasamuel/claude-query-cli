import type {
  SchemaContext,
  TableSchema,
  ColumnSchema,
} from "../adapters/adapter.js";

/** Forbidden SQL statement types — the soft-gate instruction (backlog FEAT-3.2). */
const FORBIDDEN_SQL = [
  "INSERT",
  "UPDATE",
  "DELETE",
  "DROP",
  "ALTER",
  "CREATE",
  "TRUNCATE",
];

function serializeColumn(col: ColumnSchema): string {
  const parts = [`  - ${col.name} (${col.type})`];
  if (col.references) {
    parts.push(`references ${col.references.table}.${col.references.column}`);
  }
  if (col.sampleValues && col.sampleValues.length > 0) {
    parts.push(`e.g. ${col.sampleValues.map((v) => JSON.stringify(v)).join(", ")}`);
  }
  if (col.min !== undefined || col.max !== undefined) {
    parts.push(`range ${JSON.stringify(col.min)}..${JSON.stringify(col.max)}`);
  }
  return parts.join(" — ");
}

function serializeTable(table: TableSchema): string {
  const header =
    table.rowCount !== undefined
      ? `Table "${table.name}" (${table.rowCount} rows):`
      : `Table "${table.name}":`;
  return [header, ...table.columns.map(serializeColumn)].join("\n");
}

/**
 * Render a SchemaContext as human-readable text for the Claude system prompt.
 * Never serialised as raw JSON, so Claude reasons over it more naturally
 * (backlog FEAT-5.1 / STORY-5.1.1).
 */
export function serializeSchema(schema: SchemaContext): string {
  return [
    `Data source: ${schema.sourceName} (${schema.sourceType})`,
    "",
    ...schema.tables.map(serializeTable),
  ].join("\n");
}

export interface SystemPromptOptions {
  /** --schema-only: ask Claude to describe, never execute (backlog FEAT-3.3). */
  schemaOnly?: boolean;
}

/**
 * Build the schema-first system prompt: the formatted schema plus the query
 * instructions and (for SQL sources) the SELECT-only safety instruction.
 * (TC-005 / STORY-1.2.1.)
 */
export function buildSystemPrompt(
  schema: SchemaContext,
  options: SystemPromptOptions = {},
): string {
  const sections: string[] = [
    "You translate natural-language questions into a query against a data source.",
    "Use the provided tool to return exactly one query that answers the question.",
    "",
    "SCHEMA",
    serializeSchema(schema),
  ];

  if (schema.queryType === "sql") {
    sections.push(
      "",
      "SAFETY",
      `You may only generate SELECT statements. Never generate ${FORBIDDEN_SQL.join(
        ", ",
      )}, or any other data-definition or data-modifying statement.`,
    );
  }

  if (options.schemaOnly) {
    sections.push(
      "",
      "MODE",
      "Schema-only mode: describe the query you would run to answer the question. Do not expect it to be executed, and do not request any actual data.",
    );
  }

  return sections.join("\n");
}
