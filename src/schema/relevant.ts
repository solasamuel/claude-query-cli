import type { SchemaContext } from "../adapters/adapter.js";

/**
 * Schemas with more tables than this are narrowed to the relevant subset before
 * being sent to Claude in detail; smaller schemas are sent whole (backlog
 * FEAT-5.2 / STORY-5.2.2 — "behaviour degrades gracefully for small schemas").
 */
export const RELEVANCE_THRESHOLD = 20;

/** True when a schema is large enough to be worth narrowing. */
export function shouldNarrow(schema: SchemaContext): boolean {
  return schema.tables.length > RELEVANCE_THRESHOLD;
}

/**
 * Narrow a schema to only the named tables, sent in full detail (backlog
 * FEAT-5.2 / STORY-5.2.2). Unknown names are ignored. If none of the names
 * match — or the list is empty — the full schema is returned so behaviour
 * degrades gracefully rather than sending Claude an empty schema.
 */
export function narrowToRelevantTables(
  schema: SchemaContext,
  relevantTables: string[],
): SchemaContext {
  if (relevantTables.length === 0) return schema;

  const wanted = new Set(relevantTables);
  const tables = schema.tables.filter((t) => wanted.has(t.name));

  if (tables.length === 0) return schema;

  return { ...schema, tables };
}
