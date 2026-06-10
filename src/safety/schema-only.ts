import type { SchemaContext } from "../adapters/adapter.js";

/**
 * Strip all row-derived data (sample values, min/max ranges) from a schema so
 * that, in --schema-only mode, only the structural schema — table/column names,
 * types, row counts, and FK relationships — is ever sent to Claude. (Backlog
 * FEAT-3.3 / STORY-3.3.2.)
 *
 * Row counts are aggregate metadata, not row data, and are retained: they help
 * Claude reason without exposing any individual record.
 */
export function redactSchemaForGovernance(
  schema: SchemaContext,
): SchemaContext {
  return {
    ...schema,
    tables: schema.tables.map((table) => ({
      ...table,
      columns: table.columns.map((col) => {
        // Drop sampleValues, min, max; keep name, type, references.
        const { sampleValues, min, max, ...structural } = col;
        void sampleValues;
        void min;
        void max;
        return { ...structural };
      }),
    })),
  };
}

/**
 * Audit helper: returns true if `payload` contains any *distinctive* sample
 * value or range bound drawn from the original (un-redacted) schema. Used to
 * assert that a schema-only payload leaks no row data. (TC-025.)
 *
 * Values shorter than DISTINCTIVE_LEN (e.g. the digit "1", a boolean "true")
 * are skipped: they occur incidentally in structural text such as row counts,
 * so a substring hit can't be attributed to a row-data leak. Real PII — emails,
 * names, dates, ids — is well above this threshold, which is what the gate must
 * catch.
 */
const DISTINCTIVE_LEN = 4;

export function containsRowData(
  payload: string,
  originalSchema: SchemaContext,
): boolean {
  for (const table of originalSchema.tables) {
    for (const col of table.columns) {
      const values = [
        ...(col.sampleValues ?? []),
        ...(col.min !== undefined ? [col.min] : []),
        ...(col.max !== undefined ? [col.max] : []),
      ];
      for (const v of values) {
        if (v === null || v === undefined) continue;
        const s = String(v);
        if (s.length < DISTINCTIVE_LEN) continue;
        if (payload.includes(s)) return true;
      }
    }
  }
  return false;
}
