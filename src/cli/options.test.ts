import { describe, it, expect } from "vitest";
import {
  parseCliOptions,
  CliValidationError,
  DEFAULT_LIMIT,
  OUTPUT_FORMATS,
} from "./options.js";

// FEAT-1.1 / STORY-1.1.1 + 1.1.2: option parsing and validation.
describe("parseCliOptions (FEAT-1.1)", () => {
  // TC-001: --source is required.
  it("throws CliValidationError when --source is omitted", () => {
    expect(() => parseCliOptions("a question", {})).toThrow(CliValidationError);
  });

  // TC-002: the positional question is captured and passed through.
  it("captures the question and source", () => {
    const opts = parseCliOptions("Which customers signed up?", {
      source: "postgres://localhost/db",
    });
    expect(opts.question).toBe("Which customers signed up?");
    expect(opts.source).toBe("postgres://localhost/db");
  });

  // TC-003: --output rejects unsupported values.
  it("rejects an unsupported --output value", () => {
    expect(() =>
      parseCliOptions("q", { source: "s", output: "yaml" }),
    ).toThrow(CliValidationError);
  });

  it("accepts every supported --output value", () => {
    for (const fmt of OUTPUT_FORMATS) {
      const opts = parseCliOptions("q", { source: "s", output: fmt });
      expect(opts.output).toBe(fmt);
    }
  });

  // TC-004: --limit defaults to 100 and parses as an integer.
  it("defaults --limit to 100", () => {
    const opts = parseCliOptions("q", { source: "s" });
    expect(opts.limit).toBe(DEFAULT_LIMIT);
    expect(DEFAULT_LIMIT).toBe(100);
  });

  it("parses an explicit --limit as an integer", () => {
    const opts = parseCliOptions("q", { source: "s", limit: "25" });
    expect(opts.limit).toBe(25);
  });

  it("rejects a non-numeric --limit", () => {
    expect(() =>
      parseCliOptions("q", { source: "s", limit: "lots" }),
    ).toThrow(CliValidationError);
  });

  it("defaults boolean flags to false", () => {
    const opts = parseCliOptions("q", { source: "s" });
    expect(opts.dryRun).toBe(false);
    expect(opts.schemaOnly).toBe(false);
    expect(opts.explain).toBe(false);
  });

  it("defaults --output to table", () => {
    const opts = parseCliOptions("q", { source: "s" });
    expect(opts.output).toBe("table");
  });

  it("requires a non-empty question", () => {
    expect(() => parseCliOptions(undefined, { source: "s" })).toThrow(
      CliValidationError,
    );
  });
});
