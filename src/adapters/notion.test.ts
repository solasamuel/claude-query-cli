import { describe, it, expect, vi } from "vitest";
import { NotionAdapter, type NotionLike } from "./notion.js";

const DB_RETRIEVE = {
  title: [{ plain_text: "Tasks" }],
  properties: {
    Name: { type: "title" },
    Status: {
      type: "select",
      select: { options: [{ name: "Active" }, { name: "Done" }] },
    },
    Priority: {
      type: "multi_select",
      multi_select: { options: [{ name: "High" }, { name: "Low" }] },
    },
    Created: { type: "date" },
  },
};

const QUERY_RESULT = {
  results: [
    {
      id: "page1",
      properties: {
        Name: { type: "title", title: [{ plain_text: "Ship it" }] },
        Status: { type: "select", select: { name: "Active" } },
      },
    },
  ],
};

function makeFakeNotion(): NotionLike & { queryArg: unknown } {
  const fake: NotionLike & { queryArg: unknown } = {
    queryArg: undefined,
    databases: {
      retrieve: vi.fn().mockResolvedValue(DB_RETRIEVE),
      query: vi.fn().mockImplementation((arg: unknown) => {
        fake.queryArg = arg;
        return Promise.resolve(QUERY_RESULT);
      }),
    },
  };
  return fake;
}

// TC-017 / STORY-2.4.1: fetch property schema incl. select option values.
describe("NotionAdapter.getSchema (TC-017 / STORY-2.4.1)", () => {
  it("captures property names, types, and select options", async () => {
    const notion = makeFakeNotion();
    const adapter = new NotionAdapter(() => notion);
    await adapter.connect("notion://db123");
    const schema = await adapter.getSchema();

    expect(schema.sourceType).toBe("notion");
    expect(schema.queryType).toBe("notion_filter");
    const cols = schema.tables[0].columns;
    const byName = Object.fromEntries(cols.map((c) => [c.name, c]));
    expect(byName.Name).toBeDefined();
    expect(byName.Status.sampleValues).toEqual(["Active", "Done"]);
    expect(byName.Priority.sampleValues).toEqual(["High", "Low"]);
  });

  it("uses the database title as the table name", async () => {
    const notion = makeFakeNotion();
    const adapter = new NotionAdapter(() => notion);
    await adapter.connect("notion://db123");
    const schema = await adapter.getSchema();
    expect(schema.tables[0].name).toBe("Tasks");
  });
});

// TC-018 / STORY-2.4.2: pass the JSON filter object directly to databases.query().
describe("NotionAdapter.executeQuery (TC-018 / STORY-2.4.2)", () => {
  it("passes the filter/sorts object straight through to databases.query", async () => {
    const notion = makeFakeNotion();
    const adapter = new NotionAdapter(() => notion);
    await adapter.connect("notion://db123");

    const filterObj = {
      filter: { property: "Status", select: { equals: "Active" } },
      sorts: [{ property: "Name", direction: "ascending" }],
    };
    await adapter.executeQuery(JSON.stringify(filterObj));

    expect(notion.databases.query).toHaveBeenCalledOnce();
    const arg = notion.queryArg as Record<string, unknown>;
    expect(arg.database_id).toBe("db123");
    expect(arg.filter).toEqual(filterObj.filter);
    expect(arg.sorts).toEqual(filterObj.sorts);
  });

  it("maps returned pages to flat rows", async () => {
    const notion = makeFakeNotion();
    const adapter = new NotionAdapter(() => notion);
    await adapter.connect("notion://db123");
    const rows = await adapter.executeQuery("{}");
    expect(rows).toEqual([{ id: "page1", Name: "Ship it", Status: "Active" }]);
  });
});
