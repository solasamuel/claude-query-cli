import { describe, it, expect } from "vitest";
import { assertSelectOnly, isSelectOnly, UnsafeQueryError } from "./sql.js";

// TC-021 / STORY-3.1.1: reject any non-SELECT statement before execution.
describe("assertSelectOnly — non-SELECT rejection (TC-021 / STORY-3.1.1)", () => {
  it("allows a plain SELECT", () => {
    expect(() =>
      assertSelectOnly("SELECT id, email FROM customers WHERE id > 10"),
    ).not.toThrow();
    expect(isSelectOnly("SELECT * FROM t")).toBe(true);
  });

  it("allows a SELECT with CTEs, JOINs, and subqueries", () => {
    const q = `WITH recent AS (SELECT id FROM orders WHERE created_at > NOW())
               SELECT c.name FROM customers c
               JOIN recent r ON r.id = c.id
               WHERE c.id NOT IN (SELECT customer_id FROM refunds)`;
    expect(() => assertSelectOnly(q)).not.toThrow();
  });

  it.each([
    ["INSERT", "INSERT INTO customers (name) VALUES ('x')"],
    ["UPDATE", "UPDATE customers SET name = 'x' WHERE id = 1"],
    ["DELETE", "DELETE FROM customers WHERE id = 1"],
    ["DROP", "DROP TABLE customers"],
    ["ALTER", "ALTER TABLE customers ADD COLUMN x int"],
    ["CREATE", "CREATE TABLE t (id int)"],
    ["TRUNCATE", "TRUNCATE TABLE customers"],
  ])("rejects %s", (_label, sql) => {
    expect(() => assertSelectOnly(sql)).toThrow(UnsafeQueryError);
    expect(isSelectOnly(sql)).toBe(false);
  });
});

// TC-022 / STORY-3.1.2: reject stacked / comment-obfuscated / unparseable SQL.
describe("assertSelectOnly — obfuscation & stacking (TC-022 / STORY-3.1.2)", () => {
  it("rejects stacked statements (SELECT; DELETE)", () => {
    expect(() =>
      assertSelectOnly("SELECT 1; DELETE FROM users"),
    ).toThrow(UnsafeQueryError);
  });

  it("rejects a comment-obfuscated trailing DROP", () => {
    expect(() =>
      assertSelectOnly("SELECT * FROM t -- harmless\n; DROP TABLE t"),
    ).toThrow(UnsafeQueryError);
  });

  it("rejects an unparseable string (fails closed)", () => {
    expect(() => assertSelectOnly("this is not sql at all !!!")).toThrow(
      UnsafeQueryError,
    );
  });

  it("rejects an empty query", () => {
    expect(() => assertSelectOnly("   ")).toThrow(UnsafeQueryError);
  });
});
