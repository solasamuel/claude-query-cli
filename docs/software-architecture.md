# claude-query — Software Architecture

**Document version:** 1.0 — May 2026
**Author:** Sola Samuel
**Related documents:** [`product-backlog.json`](./product-backlog.json) · [`test-plan.json`](./test-plan.json)

---

## 1. Purpose & Scope

`claude-query` is a TypeScript CLI that connects to any structured data source — PostgreSQL, CSV, JSON, Notion, Airtable — and lets a user query it in plain English. Claude's tool-use API constructs the appropriate query; the tool validates and executes it, then renders the results alongside the query it ran.

This document describes the runtime architecture, the key design decisions, and the engineering challenges. It is the technical companion to the product backlog (the *what*) and the test plan (the *how we prove it*).

---

## 2. Architectural Principles

1. **Schema-first, data-last.** Claude reasons over schema, never raw data, unless the user explicitly allows sample values. `--schema-only` guarantees zero row data leaves the machine.
2. **Tool use over text.** Claude returns a structured `execute_query` tool call, not free-form SQL text. This makes query construction reliable and type-safe (backlog `FEAT-1.2`).
3. **Hard safety gate.** A SELECT-only validator (`node-sql-parser`) is the authoritative gate. The system-prompt instruction is only a soft gate (backlog `EPIC-3`).
4. **One interface, many sources.** Every source sits behind the `DataSourceAdapter` interface, so the CLI, prompt builder, and formatters are source-agnostic (backlog `FEAT-1.3`).
5. **Transparency.** The constructed query is always shown before results.

---

## 3. High-Level Component View

```
                         ┌──────────────────────────────────────────┐
   user question  ─────▶ │                 CLI Layer                 │
   --source, flags       │        (Commander.js entrypoint)         │
                         └───────────────┬──────────────────────────┘
                                         │ parsed options
                                         ▼
                         ┌──────────────────────────────────────────┐
                         │              Orchestrator                 │
                         │  - selects adapter from --source          │
                         │  - drives schema → Claude → validate →    │
                         │    execute → format                       │
                         └───┬───────────────┬──────────────┬────────┘
                             │               │              │
          getSchema()        │               │ tool-use     │ format
                             ▼               ▼              ▼
            ┌────────────────────────┐  ┌──────────────┐  ┌────────────────┐
            │   Adapter Registry     │  │ Claude Client│  │   Formatters   │
            │  ┌──────────────────┐  │  │  (tool use)  │  │ table/json/    │
            │  │ Postgres adapter │  │  └──────┬───────┘  │ csv/markdown   │
            │  │ CSV adapter      │  │         │          └────────────────┘
            │  │ JSON adapter     │  │         ▼
            │  │ Notion adapter   │  │  ┌──────────────┐
            │  │ Airtable adapter │  │  │ Safety Gate  │  ← node-sql-parser
            │  └──────────────────┘  │  │ (SELECT only)│
            └───────────┬────────────┘  └──────┬───────┘
                        │ executeQuery(query)   │ validated query
                        ▼                       │
            ┌────────────────────────┐          │
            │  Schema Cache          │◀─────────┘
            │  (keyed by conn hash)  │
            └────────────────────────┘
```

---

## 4. Layered Responsibilities

### 4.1 CLI Layer (Commander.js)
Defines the `claude-query [question]` command and global options: `--source` (required), `--dry-run`, `--schema-only`, `--explain`, `--limit N` (default 100), `--output table|json|csv|markdown`. Validates flag values before any work begins (backlog `FEAT-1.1`; tests `TC-001`–`TC-004`).

### 4.2 Orchestrator
The control flow that ties everything together:

1. Resolve the adapter from the `--source` scheme.
2. `connect()` and obtain `getSchema()` (or a cached schema).
3. Build the schema-first system prompt and the tool definition.
4. Call Claude; parse the `tool_use` block.
5. If `--dry-run` or `--schema-only`: print and stop (no execution).
6. Otherwise validate the query through the **Safety Gate**, then `executeQuery()`.
7. Apply `--limit`, format via the selected formatter, record history.
8. `disconnect()`.

### 4.3 Adapter Layer

```ts
interface DataSourceAdapter {
  name: string
  connect(connectionString: string): Promise<void>
  getSchema(): Promise<SchemaContext>   // sent to Claude (as readable text)
  executeQuery(query: string): Promise<Row[]>
  disconnect(): Promise<void>
}
```

`SchemaContext` is a structured object **serialised to human-readable text** for the system prompt — never sent as raw JSON, so Claude reasons over it more naturally (backlog `FEAT-5.1`; test `TC-033`).

### 4.4 Claude Client (Tool Use)
Sends the `execute_query` tool. Claude responds with a `tool_use` block rather than text:

```ts
const tools = [{
  name: "execute_query",
  description: "Execute a query against the data source and return results",
  input_schema: {
    type: "object",
    properties: {
      query:      { type: "string",  description: "SQL query, filter expression, or API parameters" },
      query_type: { type: "string",  enum: ["sql", "notion_filter", "airtable_formula", "json_path"] },
      reasoning:  { type: "string",  description: "Why this query answers the question" }
    },
    required: ["query", "query_type", "reasoning"]
  }
}]
```

For large schemas the tool is extended with a `relevant_tables` field so subsequent calls can send only the tables that matter (§6.2).

### 4.5 Safety Gate
The authoritative protection against destructive queries. Parses the generated SQL with `node-sql-parser` and rejects anything that is not a single `SELECT` — including stacked statements and comment-obfuscated DDL (backlog `FEAT-3.1`; tests `TC-021`, `TC-022`).

### 4.6 Formatters
Pluggable output: `table` (default, `cli-table3`), `json` (raw array), `csv` (`csv-stringify`), `markdown` (GFM table) (backlog `FEAT-4.3`; tests `TC-029`–`TC-032`).

---

## 5. Schema-First Context Construction

Claude never sees actual data unless the user explicitly allows sample values. The schema sent per source:

| Data source | Schema sent to Claude |
|-------------|------------------------|
| **PostgreSQL** | Table names, column names/types, FK relationships, row counts (not data), 3 distinct sample values per column (`TABLESAMPLE SYSTEM` for large tables). |
| **CSV** | Column names, inferred types (string/number/date/boolean), min/max, 5 distinct sample values per column, total row count. |
| **JSON** | Inferred schema from first 10 records; nested object paths flattened with dot notation. |
| **Notion** | Database name, property names/types (title/text/number/select/date/relation), select option values. |
| **Airtable** | Table name, field names/types, linked table names, select field options. |

Under `--schema-only`, sample-value capture is suppressed or governance-approved so **no row data is transmitted** (test `TC-025`).

---

## 6. Engineering Challenges

### 6.1 Query Safety on Production Databases
Two layers, in order of authority:

- **Soft gate (advisory):** system-prompt instruction — *"You may only generate SELECT statements. Never generate INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, or TRUNCATE."* (backlog `FEAT-3.2`).
- **Hard gate (authoritative):** pre-execution parse with `node-sql-parser`; reject anything that is not a `SELECT` (backlog `FEAT-3.1`).

`--dry-run` should be the default for any first-time connection to an unfamiliar database. The constructed query is always shown before results, giving the user a chance to abort.

### 6.2 Schema Size Management
A large database may have 200+ tables; sending the full schema on every query is slow and expensive. Strategy:

1. **First call:** send the full schema. The tool schema requires a `relevant_tables` field in Claude's response.
2. **Cache** the full schema locally, keyed by a hash of the connection string, for the session (backlog `FEAT-5.2`; test `TC-034`).
3. **Subsequent calls:** ask Claude which tables are relevant to the question, then send only those table schemas in detail (test `TC-035`).

### 6.3 Notion & Airtable Query Translation
Unlike SQL, Notion and Airtable use filter-object/formula APIs rather than query strings. The `query_type` distinguishes them and the executor branches accordingly:

- **Notion** (`notion_filter`): Claude generates a JSON filter object passed directly to `notion.databases.query()`:

  ```json
  {
    "filter": {
      "and": [
        { "property": "Status",  "select": { "equals": "Active" } },
        { "property": "Created", "date":   { "past_month": {} } }
      ]
    },
    "sorts": [{ "property": "Name", "direction": "ascending" }]
  }
  ```

- **Airtable** (`airtable_formula`): Claude generates a `filterByFormula` string.
- **CSV / JSON** (`json_path`): Claude generates a filter applied to the in-memory parsed array.

---

## 7. Query Modes

| Mode | Behaviour | Executes? |
|------|-----------|-----------|
| Default | Construct and execute; results returned | ✅ |
| `--dry-run` | Show the query Claude would run | ❌ |
| `--schema-only` | Send only schema; swap `execute_query` → `describe_query` | ❌ |
| `--explain` | Print Claude's reasoning before the query/results | ✅ |
| `--limit N` | Cap results at N rows (default 100) | ✅ |

---

## 8. Technology Stack

| Concern | Choice |
|---------|--------|
| Language | TypeScript |
| CLI framework | Commander.js |
| LLM | Claude API (tool use) |
| PostgreSQL | `pg` |
| CSV parsing | `papaparse` |
| SQL safety | `node-sql-parser` |
| Notion | `@notionhq/client` |
| Airtable | `airtable` |
| Table output | `cli-table3` |
| CSV output | `csv-stringify` |

---

## 9. Data Flow (Default Mode, PostgreSQL)

```
1. CLI parses: question + --source postgres://…
2. Orchestrator → PostgresAdapter.connect()
3. getSchema()  →  SchemaContext  →  readable-text serialisation
4. Claude Client: system prompt (schema + safety) + execute_query tool + question
5. Claude → tool_use { query, query_type: "sql", reasoning }
6. Safety Gate: node-sql-parser → SELECT-only?  ── fail ─▶ clear error, stop
                                       │ pass
7. PostgresAdapter.executeQuery(query) → Row[]
8. Apply --limit → Formatter → stdout (query shown above results)
9. Record to session history; disconnect()
```

End-to-end smoke coverage: test `TC-041`.

---

## 10. Cross-Cutting Concerns

- **Session history:** last 10 queries recalled; persisted to `~/.claude-query/history.json` (backlog `FEAT-6.1`; tests `TC-036`, `TC-037`).
- **REPL & save:** interactive multi-question session reusing the schema cache; `--save` exports results (backlog `FEAT-6.2`).
- **Error handling:** a Claude response with no `tool_use` block, a parse failure, or a rejected statement all produce clear errors and never execute (tests `TC-008`, `TC-022`).

---

## 11. Known Limitations

- No JOINs across adapters (each source is queried independently).
- Notion relation queries are limited to IDs.
- In-memory filtering (CSV/JSON) is bounded by available memory for very large files.

---

## 12. Traceability

Each architectural component links to backlog items and is verified by the test plan:

| Component | Backlog | Tests |
|-----------|---------|-------|
| CLI Layer | `FEAT-1.1` | `TC-001`–`TC-004` |
| Claude tool use | `FEAT-1.2` | `TC-005`–`TC-008`, `TC-041` |
| Adapter interface | `FEAT-1.3` | `TC-009` |
| Adapters | `FEAT-2.1`–`FEAT-2.5` | `TC-010`–`TC-020` |
| Safety gate | `FEAT-3.1`–`FEAT-3.2` | `TC-021`–`TC-023` |
| Schema-only | `FEAT-3.3` | `TC-024`, `TC-025` |
| Modes & output | `FEAT-4.1`–`FEAT-4.3` | `TC-026`–`TC-032` |
| Schema context & cache | `FEAT-5.1`–`FEAT-5.2` | `TC-033`–`TC-035` |
| Session experience | `FEAT-6.1`–`FEAT-6.3` | `TC-036`–`TC-040` |
