import { Client } from "@notionhq/client";
import type {
  DataSourceAdapter,
  SchemaContext,
  Row,
  ColumnSchema,
  ColumnType,
} from "./adapter.js";

/** Minimal Notion client surface the adapter depends on (injectable for tests). */
export interface NotionLike {
  databases: {
    retrieve(args: { database_id: string }): Promise<any>;
    query(args: Record<string, unknown>): Promise<{ results: any[] }>;
  };
}

export type NotionFactory = (token?: string) => NotionLike;

/** Map a Notion property type to our column scalar type. */
function mapNotionType(propType: string): ColumnType {
  switch (propType) {
    case "number":
      return "number";
    case "checkbox":
      return "boolean";
    case "date":
    case "created_time":
    case "last_edited_time":
      return "date";
    default:
      return "string";
  }
}

/** Extract a flat value from a Notion page property object. */
function extractValue(prop: any): unknown {
  if (!prop || typeof prop !== "object") return prop;
  switch (prop.type) {
    case "title":
    case "rich_text":
      return (prop[prop.type] ?? []).map((t: any) => t.plain_text).join("");
    case "select":
      return prop.select?.name ?? null;
    case "multi_select":
      return (prop.multi_select ?? []).map((o: any) => o.name);
    case "number":
      return prop.number;
    case "checkbox":
      return prop.checkbox;
    case "date":
      return prop.date?.start ?? null;
    default:
      return prop[prop.type] ?? null;
  }
}

/**
 * Notion adapter (backlog FEAT-2.4). Fetches the database property schema
 * (including select/multi-select option values) and executes queries by passing
 * Claude's JSON Notion filter object directly to databases.query().
 */
export class NotionAdapter implements DataSourceAdapter {
  readonly name = "notion";
  private client: NotionLike | null = null;
  private databaseId = "";
  private title = "notion";

  constructor(
    private readonly factory: NotionFactory = (token) =>
      new Client({ auth: token ?? process.env.NOTION_TOKEN }) as unknown as NotionLike,
  ) {}

  async connect(source: string): Promise<void> {
    this.databaseId = source.replace(/^notion:\/\//, "");
    this.client = this.factory();
  }

  private requireClient(): NotionLike {
    if (!this.client) throw new Error("NotionAdapter: connect() not called.");
    return this.client;
  }

  async getSchema(): Promise<SchemaContext> {
    const client = this.requireClient();
    const db = await client.databases.retrieve({ database_id: this.databaseId });
    this.title =
      db.title?.map((t: any) => t.plain_text).join("") || "notion";

    const columns: ColumnSchema[] = Object.entries(db.properties ?? {}).map(
      ([propName, propDef]: [string, any]) => {
        const col: ColumnSchema = {
          name: propName,
          type: mapNotionType(propDef.type),
        };
        if (propDef.type === "select") {
          col.sampleValues = (propDef.select?.options ?? []).map(
            (o: any) => o.name,
          );
        } else if (propDef.type === "multi_select") {
          col.sampleValues = (propDef.multi_select?.options ?? []).map(
            (o: any) => o.name,
          );
        }
        return col;
      },
    );

    return {
      sourceName: this.title,
      sourceType: "notion",
      queryType: "notion_filter",
      tables: [{ name: this.title, columns }],
    };
  }

  async executeQuery(query: string): Promise<Row[]> {
    const client = this.requireClient();
    const parsed = query.trim() ? JSON.parse(query) : {};
    const result = await client.databases.query({
      database_id: this.databaseId,
      ...parsed,
    });
    return result.results.map((page: any) => {
      const row: Row = { id: page.id };
      for (const [name, prop] of Object.entries(page.properties ?? {})) {
        row[name] = extractValue(prop);
      }
      return row;
    });
  }

  async disconnect(): Promise<void> {
    this.client = null;
  }
}
