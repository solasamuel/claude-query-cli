export const DEFAULT_LIMIT = 100;
export const OUTPUT_FORMATS = ["table", "json", "csv", "markdown"] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

/** Raised for any invalid combination of CLI arguments (TC-001/003/004). */
export class CliValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliValidationError";
  }
}

/** Raw option values as Commander hands them to us (all strings/booleans). */
export interface RawCliOptions {
  source?: string;
  output?: string;
  limit?: string;
  dryRun?: boolean;
  schemaOnly?: boolean;
  explain?: boolean;
}

/** Validated, typed options the rest of the app consumes. */
export interface CliOptions {
  question: string;
  source: string;
  output: OutputFormat;
  limit: number;
  dryRun: boolean;
  schemaOnly: boolean;
  explain: boolean;
}

function isOutputFormat(value: string): value is OutputFormat {
  return (OUTPUT_FORMATS as readonly string[]).includes(value);
}

/**
 * Validate and normalise the CLI arguments (FEAT-1.1 / STORY-1.1.1 + 1.1.2).
 * Throws CliValidationError with a clear message on any invalid input.
 */
export function parseCliOptions(
  question: string | undefined,
  raw: RawCliOptions,
): CliOptions {
  if (!question || question.trim() === "") {
    throw new CliValidationError(
      'A question is required, e.g. claude-query --source <conn> "How many orders today?"',
    );
  }

  if (!raw.source || raw.source.trim() === "") {
    throw new CliValidationError(
      "--source is required (a connection string, file path, or source ID).",
    );
  }

  const output = raw.output ?? "table";
  if (!isOutputFormat(output)) {
    throw new CliValidationError(
      `--output must be one of: ${OUTPUT_FORMATS.join(", ")} (got "${output}").`,
    );
  }

  let limit = DEFAULT_LIMIT;
  if (raw.limit !== undefined) {
    const parsed = Number(raw.limit);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new CliValidationError(
        `--limit must be a positive integer (got "${raw.limit}").`,
      );
    }
    limit = parsed;
  }

  return {
    question,
    source: raw.source,
    output,
    limit,
    dryRun: raw.dryRun ?? false,
    schemaOnly: raw.schemaOnly ?? false,
    explain: raw.explain ?? false,
  };
}
