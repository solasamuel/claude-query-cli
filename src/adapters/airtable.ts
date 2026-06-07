import Airtable from "airtable";
import type {
  DataSourceAdapter,
  SchemaContext,
  Row,
  ColumnSchema,
  ColumnType,
} from "./adapter.js";

/** A field as returned by the Airtable Metadata API. */
export interface AirtableField {
  name: string;
  type: string;
  options?: {
    choices?: { name: string }[];
    linkedTableName?: string;
  };
}

export interface AirtableTableMeta {
  name: string;
  fields: AirtableField[];
}

export interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
}

/**
 * Minimal Airtable surface the adapter depends on: fetch the table schema and
 * select records by filterByFormula. Injectable so the adapter is unit-testable
 * without live API calls. (Backlog FEAT-2.5.)
 */
export interface AirtableLike {
  getTableSchema(): Promise<AirtableTableMeta>;
  selectRecords(formula?: string): Promise<AirtableRecord[]>;
}

export type AirtableFactory = (baseId: string, tableName: string) => AirtableLike;

/** Map an Airtable field type to our column scalar type. */
function mapAirtableType(fieldType: string): ColumnType {
  switch (fieldType) {
    case "number":
    case "currency":
    case "percent":
    case "rating":
    case "duration":
    case "count":
    case "autoNumber":
      return "number";
    case "checkbox":
      return "boolean";
    case "date":
    case "dateTime":
    case "createdTime":
    case "lastModifiedTime":
      return "date";
    default:
      return "string";
  }
}

/** Default factory: record selection via the airtable package; schema via the
 *  Metadata API. Network-dependent, so it is bypassed by injected fakes. */
function defaultFactory(baseId: string, tableName: string): AirtableLike {
  const apiKey = process.env.AIRTABLE_API_KEY ?? "";
  const base = new Airtable({ apiKey }).base(baseId);

  return {
    async getTableSchema(): Promise<AirtableTableMeta> {
      const res = await fetch(
        `https://api.airtable.com/v0/meta/bases/${baseId}/tables`,
        { headers: { Authorization: `Bearer ${apiKey}` } },
      );
      const json = (await res.json()) as { tables: AirtableTableMeta[] };
      const table = json.tables.find((t) => t.name === tableName);
      if (!table) throw new Error(`Airtable table not found: ${tableName}`);
      return table;
    },
    async selectRecords(formula?: string): Promise<AirtableRecord[]> {
      const records = await base(tableName)
        .select(formula ? { filterByFormula: formula } : {})
        .all();
      return records.map((r) => ({
        id: r.id,
        fields: r.fields as Record<string, unknown>,
      }));
    },
  };
}

/**
 * Airtable adapter (backlog FEAT-2.5). Fetches the field schema (including
 * linked table names and select options) and executes queries by applying
 * Claude's filterByFormula string.
 */
export class AirtableAdapter implements DataSourceAdapter {
  readonly name = "airtable";
  private client: AirtableLike | null = null;
  private tableName = "";

  constructor(private readonly factory: AirtableFactory = defaultFactory) {}

  async connect(source: string): Promise<void> {
    const rest = source.replace(/^airtable:\/\//, "");
    const [baseId, tableName] = rest.split("/");
    if (!baseId || !tableName) {
      throw new Error(
        "Airtable source must be airtable://<baseId>/<tableName>.",
      );
    }
    this.tableName = tableName;
    this.client = this.factory(baseId, tableName);
  }

  private requireClient(): AirtableLike {
    if (!this.client) throw new Error("AirtableAdapter: connect() not called.");
    return this.client;
  }

  async getSchema(): Promise<SchemaContext> {
    const client = this.requireClient();
    const meta = await client.getTableSchema();

    const columns: ColumnSchema[] = meta.fields.map((field) => {
      const col: ColumnSchema = {
        name: field.name,
        type: mapAirtableType(field.type),
      };
      if (field.options?.choices) {
        col.sampleValues = field.options.choices.map((c) => c.name);
      }
      if (field.options?.linkedTableName) {
        col.references = { table: field.options.linkedTableName, column: "id" };
      }
      return col;
    });

    return {
      sourceName: meta.name,
      sourceType: "airtable",
      queryType: "airtable_formula",
      tables: [{ name: meta.name, columns }],
    };
  }

  async executeQuery(query: string): Promise<Row[]> {
    const client = this.requireClient();
    const formula = query.trim() || undefined;
    const records = await client.selectRecords(formula);
    return records.map((r) => ({ id: r.id, ...r.fields }));
  }

  async disconnect(): Promise<void> {
    this.client = null;
  }
}
