import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import type { Row } from "../adapters/adapter.js";
import type { OutputFormat } from "../cli/options.js";
import { formatRows } from "./format.js";

/** Raised when --save would overwrite an existing file without --force. */
export class FileExistsError extends Error {
  constructor(path: string) {
    super(`Refusing to overwrite existing file: ${path} (use --force to overwrite).`);
    this.name = "FileExistsError";
  }
}

export interface SaveOptions {
  /** Overwrite an existing file instead of refusing. */
  force?: boolean;
}

/**
 * Export result rows to a file in the chosen output format (backlog FEAT-6.2 /
 * STORY-6.2.2). Creates parent directories as needed. Refuses to overwrite an
 * existing file unless `force` is set. Returns the path written.
 */
export function saveResults(
  rows: Row[],
  format: OutputFormat,
  path: string,
  options: SaveOptions = {},
): string {
  if (!options.force && existsSync(path)) {
    throw new FileExistsError(path);
  }
  mkdirSync(dirname(path), { recursive: true });
  // Table format is for terminals; saving still uses the chosen format as-is.
  writeFileSync(path, formatRows(rows, format), "utf8");
  return path;
}
