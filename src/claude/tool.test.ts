import { describe, it, expect } from "vitest";
import { buildExecuteQueryTool, EXECUTE_QUERY_TOOL_NAME } from "./tool.js";

// TC-006 / STORY-1.2.2: the execute_query tool definition must require
// query, query_type, reasoning, and constrain query_type to the four
// supported query languages.
describe("execute_query tool definition (TC-006 / STORY-1.2.2)", () => {
  it("is named execute_query", () => {
    const tool = buildExecuteQueryTool();
    expect(tool.name).toBe("execute_query");
    expect(EXECUTE_QUERY_TOOL_NAME).toBe("execute_query");
  });

  it("requires query, query_type, and reasoning", () => {
    const tool = buildExecuteQueryTool();
    expect(tool.input_schema.required).toEqual(
      expect.arrayContaining(["query", "query_type", "reasoning"]),
    );
    expect(tool.input_schema.required).toHaveLength(3);
  });

  it("constrains query_type to the four supported query languages", () => {
    const tool = buildExecuteQueryTool();
    const props = tool.input_schema.properties as Record<
      string,
      { enum?: string[]; description?: string }
    >;
    const queryType = props.query_type;
    expect(queryType.enum).toEqual([
      "sql",
      "notion_filter",
      "airtable_formula",
      "json_path",
    ]);
  });

  it("defines all three input properties with descriptions", () => {
    const tool = buildExecuteQueryTool();
    const props = tool.input_schema.properties as Record<
      string,
      { description?: string }
    >;
    for (const key of ["query", "query_type", "reasoning"]) {
      expect(props[key]).toBeDefined();
      expect(props[key].description).toBeTruthy();
    }
  });

  it("has an object input schema", () => {
    const tool = buildExecuteQueryTool();
    expect(tool.input_schema.type).toBe("object");
  });
});
