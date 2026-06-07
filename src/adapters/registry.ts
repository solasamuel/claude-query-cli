import type { DataSourceAdapter } from "./adapter.js";
import { PostgresAdapter } from "./postgres.js";
import { CsvAdapter } from "./csv.js";
import { JsonAdapter } from "./json.js";
import { NotionAdapter } from "./notion.js";
import { AirtableAdapter } from "./airtable.js";

/** Raised when a --source string matches no known adapter. */
export class UnknownSourceError extends Error {
  constructor(source: string) {
    super(
      `Unrecognised --source: ${source}. Expected a postgres://, notion://, or ` +
        `airtable:// URL, or a path to a .csv / .json file.`,
    );
    this.name = "UnknownSourceError";
  }
}

/**
 * Resolve a --source string to the appropriate adapter (EPIC-2 integration).
 * Matching is by URL scheme, then by file extension.
 */
export function resolveAdapter(source: string): DataSourceAdapter {
  if (/^postgres(ql)?:\/\//.test(source)) return new PostgresAdapter();
  if (source.startsWith("notion://")) return new NotionAdapter();
  if (source.startsWith("airtable://")) return new AirtableAdapter();

  if (source.startsWith("data:text/csv,") || /\.csv$/i.test(source)) {
    return new CsvAdapter();
  }
  if (
    source.startsWith("data:application/json,") ||
    /\.json$/i.test(source)
  ) {
    return new JsonAdapter();
  }

  throw new UnknownSourceError(source);
}
