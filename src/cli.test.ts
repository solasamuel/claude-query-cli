import { describe, it, expect, vi } from "vitest";
import { buildProgram } from "./cli.js";
import { CliValidationError } from "./cli/options.js";

// Helper: run the program with given argv (after `node claude-query`).
function run(args: string[], onRun = vi.fn()) {
  const program = buildProgram(onRun);
  program.exitOverride(); // throw instead of process.exit on commander errors
  program.configureOutput({ writeErr: () => {}, writeOut: () => {} });
  program.parse(["node", "claude-query", ...args]);
  return onRun;
}

describe("buildProgram wiring (FEAT-1.1)", () => {
  // TC-002: the positional question reaches the run callback.
  it("passes the question and source through to onRun", () => {
    const onRun = run([
      "Which customers signed up?",
      "--source",
      "postgres://localhost/db",
    ]);
    expect(onRun).toHaveBeenCalledOnce();
    const opts = onRun.mock.calls[0][0];
    expect(opts.question).toBe("Which customers signed up?");
    expect(opts.source).toBe("postgres://localhost/db");
  });

  // TC-001: missing --source is rejected by commander's requiredOption.
  it("rejects a missing --source", () => {
    expect(() => run(["a question"])).toThrow();
  });

  // TC-003: an invalid --output surfaces our CliValidationError.
  it("surfaces CliValidationError for an invalid --output", () => {
    expect(() =>
      run(["q", "--source", "s", "--output", "yaml"]),
    ).toThrow(CliValidationError);
  });

  it("registers the boolean flags as defaulting to false", () => {
    const onRun = run(["q", "--source", "s"]);
    const opts = onRun.mock.calls[0][0];
    expect(opts.dryRun).toBe(false);
    expect(opts.schemaOnly).toBe(false);
    expect(opts.explain).toBe(false);
  });

  it("threads --dry-run and --schema-only through", () => {
    const onRun = run(["q", "--source", "s", "--dry-run", "--schema-only"]);
    const opts = onRun.mock.calls[0][0];
    expect(opts.dryRun).toBe(true);
    expect(opts.schemaOnly).toBe(true);
  });
});
