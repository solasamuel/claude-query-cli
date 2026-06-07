import { describe, it, expect, vi } from "vitest";
import { PostgresAdapter, type PgClient } from "./postgres.js";

/**
 * A fake pg client that answers the adapter's introspection queries by matching
 * on SQL fragments. Lets us unit-test schema extraction and execution without a
 * live database (per the test plan: Postgres adapter is testable via a mocked
 * pg client).
 */
function makeFakeClient(overrides: Record<string, unknown[]> = {}): PgClient & {
  end: ReturnType<typeof vi.fn>;
  queries: string[];
} {
  const queries: string[] = [];
  const end = vi.fn().mockResolvedValue(undefined);

  const client = {
    queries,
    end,
    async query(sql: string, _params?: unknown[]) {
      queries.push(sql);

      if (sql.includes("information_schema.columns")) {
        return {
          rows: [
            { table_name: "customers", column_name: "id", data_type: "integer" },
            { table_name: "customers", column_name: "email", data_type: "text" },
            { table_name: "orders", column_name: "id", data_type: "integer" },
            {
              table_name: "orders",
              column_name: "customer_id",
              data_type: "integer",
            },
          ],
        };
      }
      if (sql.includes("table_constraints") || sql.includes("foreign")) {
        // FK: orders.customer_id -> customers.id
        return {
          rows: [
            {
              table_name: "orders",
              column_name: "customer_id",
              foreign_table_name: "customers",
              foreign_column_name: "id",
            },
          ],
        };
      }
      if (sql.includes("reltuples") || sql.includes("count")) {
        const m = sql.match(/'(\w+)'|"?(\w+)"?/);
        const table = sql.includes("customers") ? "customers" : "orders";
        return { rows: [{ row_count: table === "customers" ? 1200 : 5400 }] };
      }
      if (sql.includes("DISTINCT")) {
        // sample distinct values
        if (sql.includes("email")) {
          return { rows: [{ v: "a@x.com" }, { v: "b@x.com" }, { v: "c@x.com" }] };
        }
        return { rows: [{ v: 1 }, { v: 2 }, { v: 3 }] };
      }
      // A user SELECT
      if (sql in overrides) return { rows: overrides[sql] };
      return { rows: [{ id: 1, email: "a@x.com" }] };
    },
  };
  return client as PgClient & {
    end: ReturnType<typeof vi.fn>;
    queries: string[];
  };
}

// TC-010 / STORY-2.1.1: extract tables, columns/types, FK relationships.
describe("PostgresAdapter.getSchema structure (TC-010 / STORY-2.1.1)", () => {
  it("returns all tables with columns and types", async () => {
    const client = makeFakeClient();
    const adapter = new PostgresAdapter(() => client);
    await adapter.connect("postgres://localhost/db");
    const schema = await adapter.getSchema();

    expect(schema.sourceType).toBe("postgres");
    expect(schema.queryType).toBe("sql");
    const names = schema.tables.map((t) => t.name).sort();
    expect(names).toEqual(["customers", "orders"]);

    const customers = schema.tables.find((t) => t.name === "customers")!;
    const colTypes = Object.fromEntries(
      customers.columns.map((c) => [c.name, c.type]),
    );
    expect(colTypes.id).toBe("number");
    expect(colTypes.email).toBe("string");
  });

  it("captures the foreign-key relationship", async () => {
    const client = makeFakeClient();
    const adapter = new PostgresAdapter(() => client);
    await adapter.connect("postgres://localhost/db");
    const schema = await adapter.getSchema();
    const orders = schema.tables.find((t) => t.name === "orders")!;
    const fkCol = orders.columns.find((c) => c.name === "customer_id")!;
    expect(fkCol.references).toEqual({ table: "customers", column: "id" });
  });
});

// TC-011 / STORY-2.1.2: row counts and up to 3 sample distinct values.
describe("PostgresAdapter.getSchema stats (TC-011 / STORY-2.1.2)", () => {
  it("captures row counts and up to 3 sample distinct values", async () => {
    const client = makeFakeClient();
    const adapter = new PostgresAdapter(() => client);
    await adapter.connect("postgres://localhost/db");
    const schema = await adapter.getSchema();
    const customers = schema.tables.find((t) => t.name === "customers")!;
    expect(customers.rowCount).toBe(1200);
    const email = customers.columns.find((c) => c.name === "email")!;
    expect(email.sampleValues!.length).toBeLessThanOrEqual(3);
    expect(email.sampleValues).toContain("a@x.com");
  });
});

// TC-012 / STORY-2.1.3: execute SELECT, return rows; disconnect closes the client.
describe("PostgresAdapter.executeQuery (TC-012 / STORY-2.1.3)", () => {
  it("executes a query and returns rows", async () => {
    const client = makeFakeClient();
    const adapter = new PostgresAdapter(() => client);
    await adapter.connect("postgres://localhost/db");
    const rows = await adapter.executeQuery("SELECT id, email FROM customers");
    expect(rows).toEqual([{ id: 1, email: "a@x.com" }]);
  });

  it("closes the client on disconnect", async () => {
    const client = makeFakeClient();
    const adapter = new PostgresAdapter(() => client);
    await adapter.connect("postgres://localhost/db");
    await adapter.disconnect();
    expect(client.end).toHaveBeenCalledOnce();
  });
});
