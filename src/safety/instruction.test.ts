import { describe, it, expect } from "vitest";
import {
  FORBIDDEN_SQL,
  SELECT_ONLY_INSTRUCTION,
} from "./instruction.js";
import { buildSystemPrompt } from "../claude/prompt.js";
import type { SchemaContext } from "../adapters/adapter.js";

const sqlSchema: SchemaContext = {
  sourceName: "db",
  sourceType: "postgres",
  queryType: "sql",
  tables: [{ name: "t", columns: [{ name: "id", type: "number" }] }],
};

// TC-023 / STORY-3.2.1: the soft-gate instruction names every forbidden
// statement type and is present for every SQL-source request.
describe("SELECT-only instruction (TC-023 / STORY-3.2.1)", () => {
  it("names every forbidden statement type", () => {
    for (const kw of [
      "INSERT",
      "UPDATE",
      "DELETE",
      "DROP",
      "ALTER",
      "CREATE",
      "TRUNCATE",
    ]) {
      expect(FORBIDDEN_SQL).toContain(kw);
      expect(SELECT_ONLY_INSTRUCTION).toContain(kw);
    }
  });

  it("mentions SELECT as the only permitted statement", () => {
    expect(SELECT_ONLY_INSTRUCTION).toMatch(/SELECT/);
  });

  it("is embedded in the system prompt for SQL sources", () => {
    const prompt = buildSystemPrompt(sqlSchema);
    expect(prompt).toContain(SELECT_ONLY_INSTRUCTION);
  });

  it("is NOT embedded for non-SQL sources", () => {
    const notionSchema: SchemaContext = {
      ...sqlSchema,
      sourceType: "notion",
      queryType: "notion_filter",
    };
    expect(buildSystemPrompt(notionSchema)).not.toContain(
      SELECT_ONLY_INSTRUCTION,
    );
  });
});
