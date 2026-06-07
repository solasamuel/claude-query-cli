#!/usr/bin/env node
import { Command } from "commander";
import {
  parseCliOptions,
  CliValidationError,
  DEFAULT_LIMIT,
  OUTPUT_FORMATS,
  type CliOptions,
} from "./cli/options.js";

/**
 * The claude-query CLI entrypoint (FEAT-1.1 / STORY-1.1.1 + 1.1.2). Registers
 * the command and global flags, then delegates validation to parseCliOptions.
 *
 * Returns the validated options so the (future) run pipeline — and tests —
 * can drive it; building/parsing here keeps Commander glue out of the
 * unit-tested core.
 */
export function buildProgram(onRun: (opts: CliOptions) => void): Command {
  const program = new Command();

  program
    .name("claude-query")
    .description(
      "Natural language queries against any data source via Claude API",
    )
    .argument("[question]", "the question to ask, in plain English")
    .requiredOption(
      "--source <connection>",
      "connection string, file path, or source ID (required)",
    )
    .option("--dry-run", "show the query without executing it", false)
    .option(
      "--schema-only",
      "send only the schema to Claude, never actual data",
      false,
    )
    .option("--explain", "show Claude's reasoning before the query", false)
    .option(
      "--limit <n>",
      `cap results at N rows (default ${DEFAULT_LIMIT})`,
    )
    .option(
      "--output <format>",
      `output format: ${OUTPUT_FORMATS.join(" | ")}`,
    )
    .action((question: string | undefined, raw) => {
      const opts = parseCliOptions(question, raw);
      onRun(opts);
    });

  return program;
}

function main(): void {
  const program = buildProgram((opts) => {
    // The run pipeline (adapter → constructQuery → execute → format) lands in
    // EPIC-2..4. For now, surface the validated options so the scaffold is
    // verifiably wired end to end.
    process.stdout.write(
      `Ready: querying ${opts.source} (output=${opts.output}, limit=${opts.limit}` +
        `${opts.dryRun ? ", dry-run" : ""}${opts.schemaOnly ? ", schema-only" : ""})\n`,
    );
  });

  try {
    program.parse(process.argv);
  } catch (err) {
    if (err instanceof CliValidationError) {
      process.stderr.write(`Error: ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }
}

// Run only when invoked directly, not when imported by tests.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main();
}
