import type { Row } from "./adapter.js";

/**
 * A safe, declarative filter that Claude generates as a JSON object for CSV /
 * JSON sources (query_type "json_path"). Using a structured predicate set —
 * rather than eval-ing arbitrary code — keeps in-memory execution deterministic
 * and injection-free. (Backlog FEAT-2.2 / FEAT-2.3.)
 */
export type FilterOp = "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "contains" | "in";

export interface Predicate {
  field: string;
  op: FilterOp;
  value: unknown;
}

export interface JsonFilter {
  /** All predicates must match (logical AND). */
  where?: Predicate[];
  sort?: { field: string; direction?: "asc" | "desc" };
  limit?: number;
}

/** Resolve a possibly dot-notation path (e.g. "user.country") against a row. */
export function resolvePath(row: Row, path: string): unknown {
  if (Object.prototype.hasOwnProperty.call(row, path)) return row[path];
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as object)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, row);
}

function compare(actual: unknown, op: FilterOp, expected: unknown): boolean {
  switch (op) {
    case "eq":
      return actual === expected;
    case "ne":
      return actual !== expected;
    case "gt":
      return (actual as number) > (expected as number);
    case "gte":
      return (actual as number) >= (expected as number);
    case "lt":
      return (actual as number) < (expected as number);
    case "lte":
      return (actual as number) <= (expected as number);
    case "contains":
      return String(actual).includes(String(expected));
    case "in":
      return Array.isArray(expected) && expected.includes(actual);
  }
}

/** Parse a JSON filter string; throws a clear error on malformed input. */
export function parseFilter(query: string): JsonFilter {
  let parsed: unknown;
  try {
    parsed = JSON.parse(query);
  } catch {
    throw new Error(`Invalid filter: expected a JSON object, got: ${query}`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Invalid filter: expected a JSON object.");
  }
  return parsed as JsonFilter;
}

/** Apply a JsonFilter to an array of rows: where → sort → limit. */
export function applyFilter(rows: Row[], filter: JsonFilter): Row[] {
  let result = rows;

  if (filter.where && filter.where.length > 0) {
    result = result.filter((row) =>
      filter.where!.every((p) => compare(resolvePath(row, p.field), p.op, p.value)),
    );
  }

  if (filter.sort) {
    const { field, direction = "asc" } = filter.sort;
    const dir = direction === "desc" ? -1 : 1;
    result = [...result].sort((a, b) => {
      const av = resolvePath(a, field) as number | string;
      const bv = resolvePath(b, field) as number | string;
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }

  if (typeof filter.limit === "number") {
    result = result.slice(0, filter.limit);
  }

  return result;
}
