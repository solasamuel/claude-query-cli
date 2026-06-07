import pg from "pg";
import type {
  DataSourceAdapter,
  SchemaContext,
  Row,
  TableSchema,
  ColumnSchema,
  ColumnType,
} from "./adapter.js";

/** Minimal pg client surface the adapter depends on (injectable for tests). */
export interface PgClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>;
  end(): Promise<void>;
}

export type PgClientFactory = (connectionString: string) => PgClient;

/** Tables above this row count use TABLESAMPLE to avoid a full scan (TC-011). */
const LARGE_TABLE_THRESHOLD = 100_000;
const SAMPLE_VALUES = 3;

/** Map a Postgres data_type to our column scalar type. */
function mapPgType(dataType: string): ColumnType {
  const t = dataType.toLowerCase();
  if (/int|numeric|decimal|real|double|float|serial|money/.test(t)) return "number";
  if (/bool/.test(t)) return "boolean";
  if (/date|time/.test(t)) return "date";
  return "string";
}

/**
 * PostgreSQL adapter (backlog FEAT-2.1). Extracts the full schema — tables,
 * columns/types, FK relationships, row counts, and 3 sample distinct values
 * per column (TABLESAMPLE for large tables) — then executes validated SELECTs.
 *
 * The client factory is injectable so schema extraction and execution are
 * unit-testable without a live database.
 */
export class PostgresAdapter implements DataSourceAdapter {
  readonly name = "postgres";
  private client: PgClient | null = null;

  constructor(
    private readonly factory: PgClientFactory = (cs) => new pg.Client(cs),
  ) {}

  async connect(connectionString: string): Promise<void> {
    this.client = this.factory(connectionString);
    // pg.Client requires connect(); injected fakes may omit it.
    const maybeConnect = (this.client as { connect?: () => Promise<void> })
      .connect;
    if (typeof maybeConnect === "function") {
      await maybeConnect.call(this.client);
    }
  }

  private requireClient(): PgClient {
    if (!this.client) throw new Error("PostgresAdapter: connect() not called.");
    return this.client;
  }

  async getSchema(): Promise<SchemaContext> {
    const client = this.requireClient();

    const colResult = await client.query(
      `SELECT table_name, column_name, data_type
       FROM information_schema.columns
       WHERE table_schema = 'public'
       ORDER BY table_name, ordinal_position`,
    );

    const fkResult = await client.query(
      `SELECT tc.table_name, kcu.column_name,
              ccu.table_name AS foreign_table_name,
              ccu.column_name AS foreign_column_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name
       JOIN information_schema.constraint_column_usage ccu
         ON ccu.constraint_name = tc.constraint_name
       WHERE tc.constraint_type = 'FOREIGN KEY'`,
    );

    const fkByColumn = new Map<string, { table: string; column: string }>();
    for (const fk of fkResult.rows) {
      fkByColumn.set(`${fk.table_name}.${fk.column_name}`, {
        table: fk.foreign_table_name,
        column: fk.foreign_column_name,
      });
    }

    // Group columns by table.
    const tableMap = new Map<string, ColumnSchema[]>();
    for (const row of colResult.rows) {
      const columns = tableMap.get(row.table_name) ?? [];
      const col: ColumnSchema = {
        name: row.column_name,
        type: mapPgType(row.data_type),
      };
      const fk = fkByColumn.get(`${row.table_name}.${row.column_name}`);
      if (fk) col.references = fk;
      columns.push(col);
      tableMap.set(row.table_name, columns);
    }

    const tables: TableSchema[] = [];
    for (const [tableName, columns] of tableMap) {
      const rowCount = await this.getRowCount(tableName);
      for (const col of columns) {
        col.sampleValues = await this.getSampleValues(
          tableName,
          col.name,
          rowCount,
        );
      }
      tables.push({ name: tableName, columns, rowCount });
    }

    return {
      sourceName: "postgres",
      sourceType: "postgres",
      queryType: "sql",
      tables,
    };
  }

  private async getRowCount(table: string): Promise<number> {
    const client = this.requireClient();
    // Estimate via reltuples first (cheap); the fake answers either branch.
    const result = await client.query(
      `SELECT reltuples::bigint AS row_count
       FROM pg_class WHERE relname = '${table}'`,
    );
    const estimate = Number(result.rows[0]?.row_count ?? 0);
    return estimate;
  }

  private async getSampleValues(
    table: string,
    column: string,
    rowCount: number,
  ): Promise<unknown[]> {
    const client = this.requireClient();
    // Large tables: sample a slice rather than scanning the whole table.
    const from =
      rowCount > LARGE_TABLE_THRESHOLD
        ? `"${table}" TABLESAMPLE SYSTEM (1)`
        : `"${table}"`;
    const result = await client.query(
      `SELECT DISTINCT "${column}" AS v FROM ${from}
       WHERE "${column}" IS NOT NULL LIMIT ${SAMPLE_VALUES}`,
    );
    return result.rows.map((r) => r.v);
  }

  async executeQuery(query: string): Promise<Row[]> {
    const client = this.requireClient();
    const result = await client.query(query);
    return result.rows;
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.end();
      this.client = null;
    }
  }
}
