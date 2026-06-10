/**
 * The canonical list of SQL statement types claude-query forbids. Single source
 * of truth shared by the soft gate (system-prompt instruction, FEAT-3.2) and
 * referenced by the hard gate (node-sql-parser validation, FEAT-3.1).
 */
export const FORBIDDEN_SQL = [
  "INSERT",
  "UPDATE",
  "DELETE",
  "DROP",
  "ALTER",
  "CREATE",
  "TRUNCATE",
] as const;

/**
 * The soft-gate instruction embedded in the system prompt for SQL sources
 * (backlog FEAT-3.2 / STORY-3.2.1). The hard gate in safety/sql.ts is the
 * authoritative protection; this only reduces how often Claude attempts a
 * destructive query in the first place.
 */
export const SELECT_ONLY_INSTRUCTION =
  `You may only generate SELECT statements. Never generate ${FORBIDDEN_SQL.join(
    ", ",
  )}, or any other data-definition or data-modifying statement.`;
