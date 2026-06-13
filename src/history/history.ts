import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

/** How many recent queries `recall()` returns (backlog FEAT-6.1 / STORY-6.1.1). */
export const MAX_RECALL = 10;

/** Upper bound on entries persisted to disk, to avoid unbounded file growth. */
const MAX_PERSISTED = 100;

/** The default history file location (backlog FEAT-6.1 / STORY-6.1.2). */
export function defaultHistoryPath(): string {
  return join(homedir(), ".claude-query", "history.json");
}

export interface HistoryEntry {
  question: string;
  query: string;
}

/**
 * Session query history: records each question + constructed query, recalls the
 * most recent in-session, and persists to a JSON file across sessions. A
 * malformed file is tolerated — history starts clean rather than crashing.
 * (Backlog FEAT-6.1.)
 */
export class SessionHistory {
  private entries: HistoryEntry[] = [];

  constructor(private readonly filePath: string = defaultHistoryPath()) {}

  /** Append a query to the session history (most recent last internally). */
  record(entry: HistoryEntry): void {
    this.entries.push({ question: entry.question, query: entry.query });
  }

  /** The most recent up-to-MAX_RECALL entries, most-recent-first. */
  recall(): HistoryEntry[] {
    return this.entries.slice(-MAX_RECALL).reverse();
  }

  /** Load persisted history from disk; tolerate a missing or malformed file. */
  load(): void {
    try {
      const raw = readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        this.entries = parsed.filter(
          (e): e is HistoryEntry =>
            e &&
            typeof e === "object" &&
            typeof e.question === "string" &&
            typeof e.query === "string",
        );
      }
    } catch {
      // Missing file, bad JSON, or wrong shape: start clean, never crash.
      this.entries = [];
    }
  }

  /** Persist history to disk, creating the directory if needed, bounded in size. */
  save(): void {
    const bounded = this.entries.slice(-MAX_PERSISTED);
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      writeFileSync(this.filePath, JSON.stringify(bounded, null, 2), "utf8");
    } catch {
      // Persistence is best-effort; a failure here must not break a query run.
    }
  }
}
