import type { ColumnType, ColumnSchema, TableSchema } from "./adapter.js";

const SAMPLE_LIMIT = 5;
const INFER_ROWS = 100;

const DATE_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?/;

/** Classify a single raw string/value into a column scalar type. */
function classify(value: unknown): ColumnType | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  const s = String(value).trim();
  if (s === "true" || s === "false") return "boolean";
  if (s !== "" && !Number.isNaN(Number(s))) return "number";
  if (DATE_RE.test(s) && !Number.isNaN(Date.parse(s))) return "date";
  return "string";
}

/** Coerce a raw value to the column's inferred type. */
export function coerce(value: unknown, type: ColumnType): unknown {
  if (value === null || value === undefined || value === "") return null;
  switch (type) {
    case "number":
      return Number(value);
    case "boolean":
      return value === true || String(value).trim() === "true";
    case "string":
    case "date":
      return typeof value === "string" ? value : String(value);
  }
}

/**
 * Pick the dominant type across a column's sampled values. Numbers and dates
 * fall back to string if any non-conforming value appears.
 */
function inferColumnType(values: unknown[]): ColumnType {
  const seen = new Set<ColumnType>();
  for (const v of values) {
    const t = classify(v);
    if (t) seen.add(t);
  }
  if (seen.size === 0) return "string";
  if (seen.size === 1) return [...seen][0];
  // Mixed → prefer the least-restrictive that fits everything: string.
  return "string";
}

/**
 * Infer a TableSchema from an array of record objects (CSV rows or JSON
 * records). Types are inferred from the first INFER_ROWS records; min/max and
 * up to SAMPLE_LIMIT distinct sample values are captured. (Backlog FEAT-2.2 /
 * FEAT-2.3.)
 */
export function inferTableSchema(
  name: string,
  records: Record<string, unknown>[],
): TableSchema {
  const columnNames: string[] = [];
  for (const rec of records) {
    for (const key of Object.keys(rec)) {
      if (!columnNames.includes(key)) columnNames.push(key);
    }
  }

  const sample = records.slice(0, INFER_ROWS);
  const columns: ColumnSchema[] = columnNames.map((colName) => {
    const rawValues = sample.map((r) => r[colName]);
    const type = inferColumnType(rawValues);
    const coerced = rawValues
      .map((v) => coerce(v, type))
      .filter((v) => v !== null);

    const distinct: unknown[] = [];
    for (const v of coerced) {
      if (!distinct.some((d) => d === v) && distinct.length < SAMPLE_LIMIT) {
        distinct.push(v);
      }
    }

    const col: ColumnSchema = { name: colName, type, sampleValues: distinct };

    if (type === "number") {
      const nums = coerced.filter((v): v is number => typeof v === "number");
      if (nums.length > 0) {
        col.min = Math.min(...nums);
        col.max = Math.max(...nums);
      }
    } else if (type === "date") {
      const dates = coerced.map((v) => String(v)).sort();
      if (dates.length > 0) {
        col.min = dates[0];
        col.max = dates[dates.length - 1];
      }
    }

    return col;
  });

  return { name, columns, rowCount: records.length };
}

/** Coerce every field of every row according to the table's inferred types. */
export function coerceRows(
  records: Record<string, unknown>[],
  table: TableSchema,
): Record<string, unknown>[] {
  const typeByName = new Map(table.columns.map((c) => [c.name, c.type]));
  return records.map((rec) => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rec)) {
      const type = typeByName.get(key);
      out[key] = type ? coerce(value, type) : value;
    }
    return out;
  });
}
