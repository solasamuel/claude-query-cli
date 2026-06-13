import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveResults, FileExistsError } from "./save.js";
import type { Row } from "../adapters/adapter.js";

const ROWS: Row[] = [
  { name: "Alice", score: 9.5 },
  { name: "Bob", score: 7.2 },
];

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cq-save-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

// TC-039 / STORY-6.2.2: --save exports results in the chosen format; reports
// the path; defined existing-file behaviour.
describe("saveResults (TC-039 / STORY-6.2.2)", () => {
  it("writes CSV to the given path and returns it", () => {
    const file = join(dir, "out.csv");
    const written = saveResults(ROWS, "csv", file);
    expect(written).toBe(file);
    expect(existsSync(file)).toBe(true);
    const text = readFileSync(file, "utf8");
    expect(text.split("\n")[0]).toBe("name,score");
  });

  it("writes JSON when the format is json", () => {
    const file = join(dir, "out.json");
    saveResults(ROWS, "json", file);
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(ROWS);
  });

  it("writes markdown when the format is markdown", () => {
    const file = join(dir, "out.md");
    saveResults(ROWS, "markdown", file);
    expect(readFileSync(file, "utf8")).toContain("| name | score |");
  });

  it("creates parent directories as needed", () => {
    const file = join(dir, "deep", "nested", "out.json");
    saveResults(ROWS, "json", file);
    expect(existsSync(file)).toBe(true);
  });

  // Defined existing-file behaviour: refuse to overwrite unless forced.
  it("refuses to overwrite an existing file by default", () => {
    const file = join(dir, "out.json");
    saveResults(ROWS, "json", file);
    expect(() => saveResults(ROWS, "json", file)).toThrow(FileExistsError);
  });

  it("overwrites when force is true", () => {
    const file = join(dir, "out.json");
    saveResults(ROWS, "json", file);
    expect(() => saveResults([{ x: 1 }], "json", file, { force: true })).not.toThrow();
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual([{ x: 1 }]);
  });
});
