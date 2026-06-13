import { describe, it, expect } from "vitest";
import * as api from "./index.js";

// The public library surface (package `main`) must export the documented
// building blocks so `import { ... } from "claude-query"` works for consumers.
describe("public API barrel (src/index.ts)", () => {
  it("exports the adapter registry and pipeline entry points", () => {
    expect(typeof api.resolveAdapter).toBe("function");
    expect(typeof api.runQuery).toBe("function");
    expect(typeof api.constructQuery).toBe("function");
  });

  it("exports the safety gate and governance helpers", () => {
    expect(typeof api.assertSelectOnly).toBe("function");
    expect(typeof api.redactSchemaForGovernance).toBe("function");
    expect(api.UnsafeQueryError).toBeDefined();
  });

  it("exports the five adapters and output helpers", () => {
    for (const name of [
      "PostgresAdapter",
      "CsvAdapter",
      "JsonAdapter",
      "NotionAdapter",
      "AirtableAdapter",
      "formatRows",
      "renderOutput",
      "saveResults",
      "SchemaCache",
      "SessionHistory",
    ]) {
      expect(api).toHaveProperty(name);
    }
  });
});
