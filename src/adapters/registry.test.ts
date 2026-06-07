import { describe, it, expect } from "vitest";
import { resolveAdapter, UnknownSourceError } from "./registry.js";
import { PostgresAdapter } from "./postgres.js";
import { CsvAdapter } from "./csv.js";
import { JsonAdapter } from "./json.js";
import { NotionAdapter } from "./notion.js";
import { AirtableAdapter } from "./airtable.js";

describe("resolveAdapter (EPIC-2 integration)", () => {
  it("resolves postgres:// to the PostgreSQL adapter", () => {
    expect(resolveAdapter("postgres://localhost/db")).toBeInstanceOf(
      PostgresAdapter,
    );
    expect(resolveAdapter("postgresql://localhost/db")).toBeInstanceOf(
      PostgresAdapter,
    );
  });

  it("resolves notion:// and airtable:// schemes", () => {
    expect(resolveAdapter("notion://db123")).toBeInstanceOf(NotionAdapter);
    expect(resolveAdapter("airtable://app/Table")).toBeInstanceOf(
      AirtableAdapter,
    );
  });

  it("resolves a .csv path to the CSV adapter", () => {
    expect(resolveAdapter("./data/sales.csv")).toBeInstanceOf(CsvAdapter);
    expect(resolveAdapter("data:text/csv,a,b")).toBeInstanceOf(CsvAdapter);
  });

  it("resolves a .json path to the JSON adapter", () => {
    expect(resolveAdapter("./events.json")).toBeInstanceOf(JsonAdapter);
    expect(resolveAdapter("data:application/json,[]")).toBeInstanceOf(
      JsonAdapter,
    );
  });

  it("throws UnknownSourceError for an unrecognised source", () => {
    expect(() => resolveAdapter("ftp://nope")).toThrow(UnknownSourceError);
    expect(() => resolveAdapter("mystery.txt")).toThrow(UnknownSourceError);
  });
});
