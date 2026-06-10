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

async function execute(opts: CliOptions): Promise<void> {
  // Imported lazily so `buildProgram` (and its tests) stay free of SDK / adapter
  // side effects until an actual run is requested.
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const { resolveAdapter } = await import("./adapters/registry.js");
  const { runQuery } = await import("./pipeline.js");

  if (!process.env.ANTHROPIC_API_KEY) {
    process.stderr.write("Error: ANTHROPIC_API_KEY is not set.\n");
    process.exit(1);
  }

  const adapter = resolveAdapter(opts.source);
  const claude = new Anthropic();

  const result = await runQuery({
    adapter,
    claude,
    source: opts.source,
    question: opts.question,
    schemaOnly: opts.schemaOnly,
    dryRun: opts.dryRun,
  });

  if (opts.explain) {
    process.stdout.write(`Reasoning:\n  ${result.reasoning}\n\n`);
  }
  process.stdout.write(`Constructed query (${result.queryType}):\n  ${result.query}\n`);

  if (!result.executed) {
    const why = opts.schemaOnly ? "schema-only" : "dry-run";
    process.stdout.write(`\n(Not executed — ${why} mode.)\n`);
    return;
  }

  // Output formatters (table/json/csv/markdown) land in EPIC-4; for now emit a
  // capped JSON dump so the pipeline is verifiably wired end to end.
  const rows = (result.rows ?? []).slice(0, opts.limit);
  process.stdout.write(`\nResults (${rows.length} rows):\n`);
  process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
}

function main(): void {
  const program = buildProgram((opts) => {
    execute(opts).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Error: ${message}\n`);
      process.exitCode = 1;
    });
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
