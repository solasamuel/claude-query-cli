import { readFile } from "node:fs/promises";
import Papa from "papaparse";
import type {
  DataSourceAdapter,
  SchemaContext,
  Row,
  TableSchema,
} from "./adapter.js";
import { inferTableSchema, coerceRows } from "./infer.js";
import { applyFilter, parseFilter } from "./filter.js";

/**
 * CSV adapter (backlog FEAT-2.2). Parses a CSV file with papaparse, infers
 * column types from the first 100 rows, and executes queries by filtering the
 * parsed array in-memory (query_type "json_path").
 */
export class CsvAdapter implements DataSourceAdapter {
  readonly name = "csv";
  private rows: Record<string, unknown>[] = [];
  private table: TableSchema | null = null;

  async connect(source: string): Promise<void> {
    const csv = await this.readSource(source);
    const parsed = Papa.parse<Record<string, unknown>>(csv, {
      header: true,
      skipEmptyLines: true,
    });
    const records = parsed.data;
    this.table = inferTableSchema("data", records);
    this.rows = coerceRows(records, this.table);
  }

  private async readSource(source: string): Promise<string> {
    // Inline CSV via data: URL is supported for tests and piping.
    const dataPrefix = "data:text/csv,";
    if (source.startsWith(dataPrefix)) {
      return decodeURIComponent(source.slice(dataPrefix.length));
    }
    return readFile(source, "utf8");
  }

  async getSchema(): Promise<SchemaContext> {
    if (!this.table) throw new Error("CsvAdapter: connect() not called.");
    return {
      sourceName: "csv",
      sourceType: "csv",
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
