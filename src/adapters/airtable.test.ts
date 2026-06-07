import { describe, it, expect, vi } from "vitest";
import { AirtableAdapter, type AirtableLike } from "./airtable.js";

const TABLE_META = {
  name: "Projects",
  fields: [
    { name: "Name", type: "singleLineText" },
    {
      name: "Status",
      type: "singleSelect",
      options: { choices: [{ name: "Active" }, { name: "Done" }] },
    },
    { name: "Budget", type: "number" },
    { name: "Client", type: "multipleRecordLinks", options: { linkedTableName: "Clients" } },
  ],
};

const RECORDS = [
  { id: "rec1", fields: { Name: "Apollo", Status: "Active", Budget: 60000 } },
  { id: "rec2", fields: { Name: "Zephyr", Status: "Done", Budget: 30000 } },
];

function makeFakeAirtable(): AirtableLike & { formulaArg?: string } {
  const fake: AirtableLike & { formulaArg?: string } = {
    getTableSchema: vi.fn().mockResolvedValue(TABLE_META),
    selectRecords: vi.fn().mockImplementation((formula?: string) => {
      fake.formulaArg = formula;
      return Promise.resolve(RECORDS);
    }),
  };
  return fake;
}

// TC-019 / STORY-2.5.1: fetch field schema incl. linked tables and select options.
describe("AirtableAdapter.getSchema (TC-019 / STORY-2.5.1)", () => {
  it("captures field names, types, select options, and linked tables", async () => {
    const at = makeFakeAirtable();
    const adapter = new AirtableAdapter(() => at);
    await adapter.connect("airtable://app123/Projects");
    const schema = await adapter.getSchema();

    expect(schema.sourceType).toBe("airtable");
    expect(schema.queryType).toBe("airtable_formula");
    expect(schema.tables[0].name).toBe("Projects");

    const byName = Object.fromEntries(
      schema.tables[0].columns.map((c) => [c.name, c]),
    );
    expect(byName.Budget.type).toBe("number");
    expect(byName.Status.sampleValues).toEqual(["Active", "Done"]);
    expect(byName.Client.references).toEqual({ table: "Clients", column: "id" });
  });
});

// TC-020 / STORY-2.5.2: pass the filterByFormula string to the SDK.
describe("AirtableAdapter.executeQuery (TC-020 / STORY-2.5.2)", () => {
  it("passes the formula string through to selectRecords", async () => {
    const at = makeFakeAirtable();
    const adapter = new AirtableAdapter(() => at);
    await adapter.connect("airtable://app123/Projects");
    await adapter.executeQuery("{Status} = 'Active'");
    expect(at.selectRecords).toHaveBeenCalledOnce();
    expect(at.formulaArg).toBe("{Status} = 'Active'");
  });

  it("maps records to flat rows with id", async () => {
    const at = makeFakeAirtable();
    const adapter = new AirtableAdapter(() => at);
    await adapter.connect("airtable://app123/Projects");
    const rows = await adapter.executeQuery("");
    expect(rows).toEqual([
      { id: "rec1", Name: "Apollo", Status: "Active", Budget: 60000 },
      { id: "rec2", Name: "Zephyr", Status: "Done", Budget: 30000 },
    ]);
  });
});
