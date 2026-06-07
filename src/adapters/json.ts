import { readFile } from "node:fs/promises";
import type {
  DataSourceAdapter,
  SchemaContext,
  Row,
  TableSchema,
} from "./adapter.js";
import { inferTableSchema } from "./infer.js";
import { applyFilter, parseFilter } from "./filter.js";

const SCHEMA_SAMPLE = 10;

/**
 * Flatten nested object paths into dot notation for schema description, e.g.
 * { user: { name: "x" } } → { "user.name": "x" }. Arrays are treated as leaf
 * values. (Backlog FEAT-2.3.)
 */
export function flattenRecord(
  record: Record<string, unknown>,
  prefix = "",
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      Object.assign(out, flattenRecord(value as Record<string, unknown>, path));
    } else {
      out[path] = value;
    }
  }
  return out;
}

/**
 * JSON adapter (backlog FEAT-2.3). Handles flat arrays and nested objects;
 * infers schema from the first 10 records with nested paths flattened to dot
 * notation. Queries are executed against the original (nested) rows via the
 * dot-aware json_path filter.
 */
export class JsonAdapter implements DataSourceAdapter {
  readonly name = "json";
  private rows: Record<string, unknown>[] = [];
  private table: TableSchema | null = null;

  async connect(source: string): Promise<void> {
    const text = await this.readSource(source);
    const parsed = JSON.parse(text);
    const records: Record<string, unknown>[] = Array.isArray(parsed)
      ? parsed
      : [parsed];
    this.rows = records;

    // Infer schema from flattened views of the first N records.
    const flattened = records
      .slice(0, SCHEMA_SAMPLE)
      .map((r) => flattenRecord(r));
    this.table = inferTableSchema("data", flattened);
    this.table.rowCount = records.length;
  }

  private async readSource(source: string): Promise<string> {
    const dataPrefix = "data:application/json,";
    if (source.startsWith(dataPrefix)) {
      return decodeURIComponent(source.slice(dataPrefix.length));
    }
    return readFile(source, "utf8");
  }

  async getSchema(): Promise<SchemaContext> {
    if (!this.table) throw new Error("JsonAdapter: connect() not called.");
    return {
      sourceName: "json",
      sourceType: "json",
      queryType: "json_path",
      tables: [this.table],
    };
  }

  async executeQuery(query: string): Promise<Row[]> {
    return applyFilter(this.rows, parseFilter(query));
  }

  async disconnect(): Promise<void> {
    this.rows = [];
    this.table = null;
  }
}
