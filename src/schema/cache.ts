import { createHash } from "node:crypto";
import type { SchemaContext } from "../adapters/adapter.js";

/**
 * Hash a connection string into a stable, opaque cache key. SHA-256 hex, so the
 * raw connection string (and any embedded credentials) never appears in the key
 * or in logs. (Backlog FEAT-5.2 / STORY-5.2.1.)
 */
export function connectionHash(connectionString: string): string {
  return createHash("sha256").update(connectionString).digest("hex");
}

type Loader = () => Promise<SchemaContext>;

/**
 * Session-scoped cache of full schemas keyed by connection-string hash. The
 * first query extracts and caches the schema; subsequent queries in the same
 * session reuse it, skipping re-extraction. (Backlog FEAT-5.2 / STORY-5.2.1.)
 *
 * Scope is the cache instance: a fresh SchemaCache (a new process / session)
 * starts empty.
 */
export class SchemaCache {
  private readonly store = new Map<string, SchemaContext>();

  has(connectionString: string): boolean {
    return this.store.has(connectionHash(connectionString));
  }

  /** Return the cached schema, or run `load` once and cache the result. */
  async getOrLoad(
    connectionString: string,
    load: Loader,
  ): Promise<SchemaContext> {
    const key = connectionHash(connectionString);
    const cached = this.store.get(key);
    if (cached) return cached;

    const schema = await load();
    this.store.set(key, schema);
    return schema;
  }

  /** Drop a cached schema (e.g. on a known schema change). */
  invalidate(connectionString: string): void {
    this.store.delete(connectionHash(connectionString));
  }
}
