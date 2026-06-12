import type { Row } from "../adapters/adapter.js";

export interface LimitedResult {
  /** The capped rows (at most `limit`). */
  rows: Row[];
  /** True if rows were dropped to meet the limit. */
  truncated: boolean;
  /** The total row count before capping. */
  total: number;
}

/**
 * Cap a result set at `limit` rows regardless of the query, reporting whether
 * truncation occurred so the caller can indicate it to the user. (Backlog
 * FEAT-4.2 / STORY-4.2.2; default limit is 100, enforced upstream.)
 */
export function applyLimit(rows: Row[], limit: number): LimitedResult {
  const total = rows.length;
  if (total <= limit) {
    return { rows, truncated: false, total };
  }
  return { rows: rows.slice(0, limit), truncated: true, total };
}
