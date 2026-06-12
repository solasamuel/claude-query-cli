import type { RunQueryResult } from "../pipeline.js";
import type { OutputFormat } from "../cli/options.js";
import { formatRows } from "./format.js";
import { applyLimit } from "./limit.js";

export interface RenderOptions {
  output: OutputFormat;
  limit: number;
  explain: boolean;
  /** Why nothing was executed, when result.executed is false. */
  mode?: "dry-run" | "schema-only";
}

/**
 * Render a RunQueryResult to a single output string (backlog FEAT-4.1 / 4.2 /
 * 4.3 view layer):
 *  - --explain: print reasoning before the query (TC-027);
 *  - always show the constructed query before results (NOTE: always show query);
 *  - --limit: cap rows and indicate truncation (TC-028);
 *  - dry-run / schema-only: show the query, note it was not executed (TC-026);
 *  - otherwise format the rows with the chosen formatter (TC-029..032).
 */
export function renderOutput(
  result: RunQueryResult,
  options: RenderOptions,
): string {
  const sections: string[] = [];

  if (options.explain && result.reasoning) {
    sections.push(`Reasoning:\n  ${result.reasoning}\n`);
  }

  sections.push(`Constructed query (${result.queryType}):\n  ${result.query}`);

  if (!result.executed) {
    const why = options.mode ?? "dry-run";
    sections.push(`\n(Not executed — ${why} mode.)`);
    return sections.join("\n");
  }

  const { rows, truncated, total } = applyLimit(
    result.rows ?? [],
    options.limit,
  );

  const heading = truncated
    ? `Results (showing ${rows.length} of ${total} rows — truncated by --limit ${options.limit}):`
    : `Results (${rows.length} rows):`;

  sections.push(`\n${heading}`);
  sections.push(formatRows(rows, options.output));

  return sections.join("\n");
}
