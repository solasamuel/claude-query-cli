import Table from "cli-table3";
import { stringify } from "csv-stringify/sync";
import type { Row } from "../adapters/adapter.js";
import type { OutputFormat } from "../cli/options.js";

/** Column order: the union of all row keys, in first-seen order. */
function columnsOf(rows: Row[]): string[] {
  const cols: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!cols.includes(key)) cols.push(key);
    }
  }
  return cols;
}

/** Render a single cell value as a string for text-based formats. */
function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function toTable(rows: Row[]): string {
  if (rows.length === 0) return "(no rows)";
  const cols = columnsOf(rows);
  const table = new Table({ head: cols });
  for (const row of rows) {
    table.push(cols.map((c) => cell(row[c])));
  }
  return table.toString();
}

function toJson(rows: Row[]): string {
  return JSON.stringify(rows, null, 2);
}

function toCsv(rows: Row[]): string {
  if (rows.length === 0) return "";
  const cols = columnsOf(rows);
  return stringify(rows, { header: true, columns: cols });
}

function toMarkdown(rows: Row[]): string {
  if (rows.length === 0) return "(no rows)";
  const cols = columnsOf(rows);
  const header = `| ${cols.join(" | ")} |`;
  const separator = `| ${cols.map(() => "---").join(" | ")} |`;
  const body = rows.map(
    (row) => `| ${cols.map((c) => cell(row[c])).join(" | ")} |`,
  );
  return [header, separator, ...body].join("\n");
}

/**
 * Format result rows in the chosen output format (backlog FEAT-4.3):
 * table (default, cli-table3), json (raw array), csv (csv-stringify with
 * header), markdown (GFM table). (TC-029..032.)
 */
export function formatRows(rows: Row[], format: OutputFormat): string {
  switch (format) {
    case "json":
      return toJson(rows);
    case "csv":
      return toCsv(rows);
    case "markdown":
      return toMarkdown(rows);
    case "table":
    default:
      return toTable(rows);
  }
}
