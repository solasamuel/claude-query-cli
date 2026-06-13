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
    .option("--save <file>", "export the results to a file")
    .option("--force", "overwrite the --save target if it exists", false)
    .option("--repl", "interactive mode: ask multiple questions", false)
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
  const { renderOutput } = await import("./output/render.js");
  const { saveResults } = await import("./output/save.js");
  const { applyLimit } = await import("./output/limit.js");
  const { SchemaCache } = await import("./schema/cache.js");
  const { SessionHistory } = await import("./history/history.js");

  if (!process.env.ANTHROPIC_API_KEY) {
    process.stderr.write("Error: ANTHROPIC_API_KEY is not set.\n");
    process.exit(1);
  }

  const claude = new Anthropic();
  const history = new SessionHistory();
  history.load();

  const mode = opts.schemaOnly
    ? ("schema-only" as const)
    : opts.dryRun
      ? ("dry-run" as const)
      : undefined;

  // Run one question end to end: pipeline → render → optional save → history.
  // A fresh adapter per question keeps connection lifecycles clean.
  const askOnce = async (question: string, cache: InstanceType<typeof SchemaCache>): Promise<string> => {
    const adapter = resolveAdapter(opts.source);
    const result = await runQuery({
      adapter,
      claude,
      source: opts.source,
      question,
      schemaOnly: opts.schemaOnly,
      dryRun: opts.dryRun,
      cache,
    });

    let out = renderOutput(result, {
      output: opts.output,
      limit: opts.limit,
      explain: opts.explain,
      mode,
    });

    history.record({ question, query: result.query });

    if (opts.save && result.executed && result.rows) {
      const { rows } = applyLimit(result.rows, opts.limit);
      const path = saveResults(rows, opts.output, opts.save, {
        force: opts.force,
      });
      out += `\n\nSaved results to ${path}`;
    }

    return out;
  };

  if (opts.repl) {
    const { runRepl } = await import("./repl/repl.js");
    const { createInterface } = await import("node:readline");
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const prompt = (): Promise<string | null> =>
      new Promise((resolve) => rl.question("claude-query> ", (a) => resolve(a)));

    process.stdout.write(
      `Connected to ${opts.source}. Ask a question, or type "exit" to quit.\n`,
    );
    await runRepl({
      prompt,
      write: (s) => process.stdout.write(s),
      ask: askOnce,
    });
    rl.close();
    history.save();
    return;
  }

  const cache = new SchemaCache();
  process.stdout.write((await askOnce(opts.question, cache)) + "\n");
  history.save();
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
