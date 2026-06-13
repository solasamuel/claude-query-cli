import { SchemaCache } from "../schema/cache.js";

/** Commands that end the REPL session (backlog FEAT-6.2 / STORY-6.2.1). */
export const EXIT_COMMANDS = ["exit", "quit", ":q"];

export interface ReplOptions {
  /** Read the next line of input; resolves null at end-of-input. */
  prompt: () => Promise<string | null>;
  /** Write output (stdout in production). */
  write: (text: string) => void;
  /**
   * Run one question. Receives the shared session SchemaCache so schema
   * extraction is reused across questions (the whole point of the REPL).
   */
  ask: (question: string, cache: SchemaCache) => Promise<string>;
}

/**
 * Interactive REPL: ask multiple questions in one session, reusing the schema
 * cache across them, until an exit command or end-of-input. An error on one
 * question is reported but does not end the session. (Backlog FEAT-6.2 /
 * STORY-6.2.1.)
 */
export async function runRepl(options: ReplOptions): Promise<void> {
  const { prompt, write, ask } = options;
  const cache = new SchemaCache(); // shared across every question this session

  for (;;) {
    const line = await prompt();
    if (line === null) break; // EOF

    const question = line.trim();
    if (question === "") continue; // skip blank lines
    if (EXIT_COMMANDS.includes(question.toLowerCase())) break;

    try {
      const output = await ask(question, cache);
      write(output + "\n");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      write(`Error: ${message}\n`);
    }
  }
}
