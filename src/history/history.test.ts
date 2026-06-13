import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionHistory, MAX_RECALL } from "./history.js";

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cq-history-"));
  file = join(dir, "nested", "history.json"); // nested dir must be created
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

// TC-036 / STORY-6.1.1: recall the last 10 queries in a session, most-recent-first.
describe("SessionHistory recall (TC-036 / STORY-6.1.1)", () => {
  it("records question + constructed query and recalls most-recent-first", () => {
    const h = new SessionHistory(file);
    h.record({ question: "q1", query: "SELECT 1" });
    h.record({ question: "q2", query: "SELECT 2" });

    const recent = h.recall();
    expect(recent).toHaveLength(2);
    expect(recent[0]).toMatchObject({ question: "q2", query: "SELECT 2" });
    expect(recent[1]).toMatchObject({ question: "q1", query: "SELECT 1" });
  });

  it("recalls at most MAX_RECALL (10) entries", () => {
    const h = new SessionHistory(file);
    for (let i = 0; i < 15; i++) h.record({ question: `q${i}`, query: `Q${i}` });

    const recent = h.recall();
    expect(recent).toHaveLength(MAX_RECALL);
    expect(MAX_RECALL).toBe(10);
    expect(recent[0].question).toBe("q14"); // most recent
  });
});

// TC-037 / STORY-6.1.2: persist to the history file (creating the dir),
// tolerate a malformed file without crashing.
describe("SessionHistory persistence (TC-037 / STORY-6.1.2)", () => {
  it("writes the history file, creating the directory if missing", () => {
    const h = new SessionHistory(file);
    h.record({ question: "q", query: "SELECT 1" });
    h.save();

    expect(existsSync(file)).toBe(true);
    const onDisk = JSON.parse(readFileSync(file, "utf8"));
    expect(onDisk[0]).toMatchObject({ question: "q", query: "SELECT 1" });
  });

  it("loads existing history from disk", () => {
    const h1 = new SessionHistory(file);
    h1.record({ question: "old", query: "SELECT old" });
    h1.save();

    const h2 = new SessionHistory(file);
    h2.load();
    expect(h2.recall()[0]).toMatchObject({ question: "old" });
  });

  it("tolerates a malformed history file without crashing", () => {
    writeFileSync(file.replace("/nested/", "/"), "not json {{{");
    const flat = file.replace("/nested/", "/");
    const h = new SessionHistory(flat);
    expect(() => h.load()).not.toThrow();
    expect(h.recall()).toEqual([]); // starts clean
    // and can still record + save over the bad file
    h.record({ question: "q", query: "Q" });
    expect(() => h.save()).not.toThrow();
  });

  it("caps the persisted file to a bounded number of entries", () => {
    const h = new SessionHistory(file);
    for (let i = 0; i < 50; i++) h.record({ question: `q${i}`, query: `Q${i}` });
    h.save();
    const onDisk = JSON.parse(readFileSync(file, "utf8"));
    // The persisted log is bounded (not unbounded growth).
    expect(onDisk.length).toBeLessThanOrEqual(100);
    expect(onDisk.length).toBeGreaterThanOrEqual(10);
  });
});
