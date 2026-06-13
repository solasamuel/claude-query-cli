import { describe, it, expect, vi } from "vitest";
import { SchemaCache, connectionHash } from "./cache.js";
import type { SchemaContext } from "../adapters/adapter.js";

const schema: SchemaContext = {
  sourceName: "db",
  sourceType: "postgres",
  queryType: "sql",
  tables: [{ name: "t", columns: [{ name: "id", type: "number" }] }],
};

describe("connectionHash (FEAT-5.2 / STORY-5.2.1)", () => {
  it("is stable for the same connection string", () => {
    expect(connectionHash("postgres://localhost/db")).toBe(
      connectionHash("postgres://localhost/db"),
    );
  });

  it("differs for different connection strings", () => {
    expect(connectionHash("postgres://localhost/a")).not.toBe(
      connectionHash("postgres://localhost/b"),
    );
  });

  it("does not embed the raw connection string (no credential leak)", () => {
    const h = connectionHash("postgres://user:secret@host/db");
    expect(h).not.toContain("secret");
    expect(h).not.toContain("user");
  });
});

// TC-034 / STORY-5.2.1: cache the full schema keyed by connection hash; a cache
// hit skips re-extraction; scoped to the session (the cache instance).
describe("SchemaCache (TC-034 / STORY-5.2.1)", () => {
  it("extracts once and serves subsequent calls from cache", async () => {
    const cache = new SchemaCache();
    const extract = vi.fn().mockResolvedValue(schema);

    const first = await cache.getOrLoad("postgres://localhost/db", extract);
    const second = await cache.getOrLoad("postgres://localhost/db", extract);

    expect(first).toBe(schema);
    expect(second).toBe(schema);
    expect(extract).toHaveBeenCalledOnce(); // re-extraction skipped on hit
  });

  it("extracts separately for different connection strings", async () => {
    const cache = new SchemaCache();
    const extract = vi.fn().mockResolvedValue(schema);

    await cache.getOrLoad("postgres://localhost/a", extract);
    await cache.getOrLoad("postgres://localhost/b", extract);

    expect(extract).toHaveBeenCalledTimes(2);
  });

  it("two cache instances do not share state (session scope)", async () => {
    const extract = vi.fn().mockResolvedValue(schema);
    await new SchemaCache().getOrLoad("postgres://localhost/db", extract);
    await new SchemaCache().getOrLoad("postgres://localhost/db", extract);
    expect(extract).toHaveBeenCalledTimes(2);
  });

  it("has() reports presence by connection string", async () => {
    const cache = new SchemaCache();
    expect(cache.has("postgres://localhost/db")).toBe(false);
    await cache.getOrLoad("postgres://localhost/db", () =>
      Promise.resolve(schema),
    );
    expect(cache.has("postgres://localhost/db")).toBe(true);
  });
});
