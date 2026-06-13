import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const README = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "..", "README.md"),
  "utf8",
);

// TC-040 / STORY-6.3.1-6.3.2: the README must cover install, API key, per-adapter
// setup with examples, the flag reference, the governance note, and limitations.
describe("README completeness (TC-040 / STORY-6.3)", () => {
  it("documents npx and global installation", () => {
    expect(README).toMatch(/npx claude-query/);
    expect(README).toMatch(/npm install -g claude-query/);
  });

  it("documents ANTHROPIC_API_KEY setup", () => {
    expect(README).toContain("ANTHROPIC_API_KEY");
  });

  it("documents the connection format for every adapter", () => {
    expect(README).toMatch(/postgres:\/\//);
    expect(README).toMatch(/\.csv/);
    expect(README).toMatch(/\.json/);
    expect(README).toMatch(/notion:\/\//);
    expect(README).toMatch(/airtable:\/\//);
  });

  it("includes at least 5 example queries per adapter type", () => {
    // Each adapter section heading is followed by a fenced example block; we
    // assert there are enough example invocations overall (5 per adapter x 5).
    const examples = README.match(/claude-query --source/g) ?? [];
    expect(examples.length).toBeGreaterThanOrEqual(25);
  });

  it("documents every CLI flag", () => {
    for (const flag of [
      "--source",
      "--dry-run",
      "--schema-only",
      "--explain",
      "--limit",
      "--output",
      "--save",
      "--repl",
    ]) {
      expect(README).toContain(flag);
    }
  });

  it("explains --schema-only for data governance", () => {
    expect(README.toLowerCase()).toContain("governance");
    expect(README).toMatch(/--schema-only/);
  });

  it("lists known limitations (no cross-adapter JOINs, Notion relations by ID)", () => {
    expect(README.toLowerCase()).toContain("limitation");
    expect(README.toLowerCase()).toMatch(/join/);
    expect(README.toLowerCase()).toMatch(/notion relation/);
  });

  it("mentions the query-safety SELECT-only guarantee", () => {
    expect(README).toMatch(/SELECT/);
    expect(README.toLowerCase()).toMatch(/safety|never.*execute|destructive/);
  });
});
