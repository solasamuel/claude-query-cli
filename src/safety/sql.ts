// node-sql-parser ships as CommonJS — the named `{ Parser }` import works under
// esbuild/Vitest but fails under real Node ESM, so import the default and
// destructure. (Verified by building dist and running it under node.)
import sqlParser from "node-sql-parser";

const { Parser } = sqlParser;
const parser = new Parser();

/**
 * Raised when a generated query is not a single, safe SELECT. This is the hard
 * safety gate (backlog FEAT-3.1) — the authoritative protection against
 * destructive queries reaching a production database.
 */
export class UnsafeQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeQueryError";
  }
}

/**
 * Assert that `sql` is exactly one SELECT statement. Parses with
 * node-sql-parser and rejects anything else — INSERT/UPDATE/DELETE/DROP/
 * ALTER/CREATE/TRUNCATE, stacked statements, comment-obfuscated DDL, and
 * anything that fails to parse (fails closed). (TC-021 / TC-022.)
 */
export function assertSelectOnly(sql: string): void {
  const trimmed = sql.trim();
  if (trimmed === "") {
    throw new UnsafeQueryError("Empty query — nothing to validate.");
  }

  let ast: unknown;
  try {
    // Postgres dialect is the broadest fit; the gate only inspects statement
    // type, so dialect specifics don't affect the SELECT-only decision.
    ast = parser.astify(trimmed, { database: "postgresql" });
  } catch (err) {
    // Fail closed: if we cannot prove it is a safe SELECT, reject it.
    const detail = err instanceof Error ? err.message : String(err);
    throw new UnsafeQueryError(
      `Could not parse the query as a safe SELECT (rejected): ${detail}`,
    );
  }

  // astify returns a single node or an array (stacked statements).
  const statements = Array.isArray(ast) ? ast : [ast];

  if (statements.length === 0) {
    throw new UnsafeQueryError("No statement found in the query.");
  }
  if (statements.length > 1) {
    throw new UnsafeQueryError(
      "Multiple statements are not allowed — only a single SELECT.",
    );
  }

  const type = (statements[0] as { type?: string }).type;
  if (type !== "select") {
    throw new UnsafeQueryError(
      `Only SELECT statements are allowed (got "${type ?? "unknown"}"). ` +
        "INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, and TRUNCATE are forbidden.",
    );
  }
}

/** Boolean form of {@link assertSelectOnly} for non-throwing checks. */
export function isSelectOnly(sql: string): boolean {
  try {
    assertSelectOnly(sql);
    return true;
  } catch {
    return false;
  }
}
