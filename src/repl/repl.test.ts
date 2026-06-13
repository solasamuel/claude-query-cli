import { describe, it, expect, vi } from "vitest";
import { runRepl, EXIT_COMMANDS } from "./repl.js";

/** A scripted prompt() that yields each line then null (EOF). */
function scriptedPrompt(lines: string[]): () => Promise<string | null> {
  let i = 0;
  return () => Promise.resolve(i < lines.length ? lines[i++] : null);
}

// TC-038 / STORY-6.2.1: REPL accepts multiple questions until exit, reuses the
// schema cache across questions, and exits cleanly.
describe("runRepl (TC-038 / STORY-6.2.1)", () => {
  it("runs each question through ask and reuses the same cache", async () => {
    const ask = vi.fn().mockResolvedValue("OK");
    const caches: unknown[] = [];

    await runRepl({
      prompt: scriptedPrompt(["question one", "question two", "exit"]),
      write: () => {},
      ask: async (question, cache) => {
        caches.push(cache);
        return ask(question, cache);
      },
    });

    expect(ask).toHaveBeenCalledTimes(2);
    expect(ask.mock.calls[0][0]).toBe("question one");
    expect(ask.mock.calls[1][0]).toBe("question two");
    // The same cache object is passed to every question (schema reused).
    expect(caches[0]).toBe(caches[1]);
    expect(caches[0]).toBeDefined();
  });

  it("stops on an exit command without running it as a question", async () => {
    const ask = vi.fn().mockResolvedValue("OK");
    await runRepl({
      prompt: scriptedPrompt(["q1", "quit"]),
      write: () => {},
      ask,
    });
    expect(ask).toHaveBeenCalledOnce(); // "quit" not treated as a question
  });

  it("stops cleanly on EOF (null)", async () => {
    const ask = vi.fn().mockResolvedValue("OK");
    await runRepl({
      prompt: scriptedPrompt([]), // immediate EOF
      write: () => {},
      ask,
    });
    expect(ask).not.toHaveBeenCalled();
  });

  it("skips blank lines", async () => {
    const ask = vi.fn().mockResolvedValue("OK");
    await runRepl({
      prompt: scriptedPrompt(["", "   ", "real question", "exit"]),
      write: () => {},
      ask,
    });
    expect(ask).toHaveBeenCalledOnce();
    expect(ask.mock.calls[0][0]).toBe("real question");
  });

  it("continues after an error on one question", async () => {
    const ask = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce("OK");
    const out: string[] = [];
    await runRepl({
      prompt: scriptedPrompt(["bad", "good", "exit"]),
      write: (s) => out.push(s),
      ask,
    });
    expect(ask).toHaveBeenCalledTimes(2);
    expect(out.join("")).toMatch(/boom/i);
  });

  it("recognises all documented exit commands", () => {
    expect(EXIT_COMMANDS).toEqual(expect.arrayContaining(["exit", "quit"]));
  });
});
