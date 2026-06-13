# claude-query

> Natural language queries against any data source via Claude API

`claude-query` is a CLI tool that connects to any structured data source — a PostgreSQL database, a CSV file, a JSON file, a Notion database, or an Airtable base — and lets you query it in plain English. It uses Claude's **tool-use API** to construct and execute the appropriate query, then returns formatted results with the query it ran shown transparently.

```bash
$ claude-query --source postgres://localhost/customers \
  "Which customers signed up in the last 30 days and have not made a purchase?"

  Constructed query:
  SELECT name, email, created_at FROM customers
  WHERE created_at > NOW() - INTERVAL '30 days'
  AND id NOT IN (SELECT DISTINCT customer_id FROM orders)
  ORDER BY created_at DESC

  Results (14 rows):
  ┌──────────────────┬──────────────────────────┬─────────────────────┐
  │ name             │ email                    │ created_at          │
  ├──────────────────┼──────────────────────────┼─────────────────────┤
  │ Alice Johnson    │ alice@example.com        │ 2026-05-01 09:23:14 │
  │ ...              │ ...                      │ ...                 │
  └──────────────────┴──────────────────────────┴─────────────────────┘
```

---

## Why

Every enterprise customer asks within the first 30 minutes: *can Claude understand our data?* `claude-query` lets you answer that question live, using their actual database, before any integration work starts. Connect it to their PostgreSQL, ask a business question in plain English, and show Claude generating and executing the correct query. The `--schema-only` flag means you can run this even when they won't grant production data access.

---

## Installation

Run it without installing:

```bash
npx claude-query --source <connection> "your question"
```

Or install globally:

```bash
npm install -g claude-query
```

### API key

`claude-query` calls the Claude API. Set your key in the environment:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

---

## Quick start

```bash
claude-query --source postgres://localhost/mydb "How many orders were placed last week?"
```

The constructed query is always shown before any results. For a first connection to an unfamiliar database, add `--dry-run` to see the query without executing it.

---

## Flag reference

| Flag | Description | Default |
|------|-------------|---------|
| `--source <conn>` | **Required.** Connection string / path / ID for the data source. | — |
| `--dry-run` | Show the query Claude would run; do not execute. Safe for production. | off |
| `--schema-only` | Send only the schema to Claude, never actual data. For strict data governance. | off |
| `--explain` | Show Claude's step-by-step reasoning before the query. | off |
| `--limit <N>` | Cap results at N rows regardless of the query. | 100 |
| `--output <fmt>` | Output format: `table`, `json`, `csv`, `markdown`. | table |
| `--save <file>` | Export the results to a file in the chosen `--output` format. Refuses to overwrite unless `--force`. | — |
| `--force` | Overwrite the `--save` target if it already exists. | off |
| `--repl` | Interactive mode: ask multiple questions in one session (the question argument is optional). | off |

---

## Sessions, history & saving

- **Interactive REPL** — run `claude-query --source <conn> --repl` to ask several questions against the same source without reconnecting. The schema is extracted once and reused across questions in the session. Type `exit`, `quit`, or `:q` to leave.

  ```bash
  claude-query --source postgres://localhost/shop --repl
  claude-query> Top 5 products by revenue this quarter
  claude-query> Now break that down by country
  claude-query> exit
  ```

- **Query history** — the last 10 queries are recalled within a session, and the full log is persisted to `~/.claude-query/history.json` across sessions (a malformed history file is tolerated, not fatal).

- **Saving results** — add `--save out.csv` to export the result set in the chosen `--output` format. Use `--force` to overwrite an existing file:

  ```bash
  claude-query --source ./sales.csv "Total revenue by region" --output csv --save revenue.csv
  ```

---

## Output formats

- **table** (default) — pretty-printed ASCII table
- **json** — raw JSON array (`--output json`)
- **csv** — CSV with headers (`--output csv`)
- **markdown** — GFM table, ready to paste into docs (`--output markdown`)

---

## Data sources

### PostgreSQL

**Source format:** a standard connection string.

```bash
claude-query --source postgres://user:pass@localhost:5432/dbname "..."
```

On connect, `claude-query` extracts the full schema — table names, column names and types, foreign-key relationships, row counts, and 3 sample distinct values per column — and sends it (not the data) to Claude.

**Examples:**

```bash
claude-query --source postgres://localhost/shop "Which customers signed up in the last 30 days and have not made a purchase?"
claude-query --source postgres://localhost/shop "Top 10 products by revenue this quarter"
claude-query --source postgres://localhost/shop "Average order value per country, highest first"
claude-query --source postgres://localhost/shop "Which orders are missing a shipping address?"
claude-query --source postgres://localhost/shop "Monthly signup count for the last 12 months" --output markdown
```

### CSV

**Source format:** a path to a `.csv` file.

```bash
claude-query --source ./sales.csv "..."
```

Column types are inferred from the first 100 rows; Claude receives column names, types, min/max, 5 sample distinct values per column, and the row count. Queries are executed by filtering the parsed array in memory.

**Examples:**

```bash
claude-query --source ./sales.csv "Total revenue by region"
claude-query --source ./sales.csv "Rows where amount is greater than 1000 and status is open"
claude-query --source ./sales.csv "Top 5 sales reps by closed deals"
claude-query --source ./sales.csv "Deals created in Q1 2026"
claude-query --source ./sales.csv "Count of rows per product category" --output csv
```

### JSON

**Source format:** a path to a `.json` file (flat array of objects, or nested).

```bash
claude-query --source ./events.json "..."
```

Schema is inferred from the first 10 records; nested object paths are flattened with dot notation.

**Examples:**

```bash
claude-query --source ./events.json "Events of type 'purchase' in the last 7 days"
claude-query --source ./events.json "How many distinct users triggered an event?"
claude-query --source ./events.json "Average value of metadata.amount per event type"
claude-query --source ./events.json "Events where user.country is 'GB'"
claude-query --source ./events.json "Most common event type" --output json
```

### Notion

**Source format:** a Notion database ID. Set a Notion integration token in the environment.

```bash
export NOTION_TOKEN=secret_...
claude-query --source notion://<database-id> "..."
```

`claude-query` fetches the database's property schema (including all select / multi-select option values). For Notion, Claude generates a JSON filter object that is passed directly to the Notion query API.

**Examples:**

```bash
claude-query --source notion://abcd1234 "Tasks with status Active created this month"
claude-query --source notion://abcd1234 "Pages assigned to Alice, sorted by due date"
claude-query --source notion://abcd1234 "Items tagged Urgent or High priority"
claude-query --source notion://abcd1234 "Entries with an empty owner field"
claude-query --source notion://abcd1234 "Count of pages per status" --output markdown
```

### Airtable

**Source format:** a base ID and table name. Set an Airtable API key in the environment.

```bash
export AIRTABLE_API_KEY=key...
claude-query --source airtable://<base-id>/<table-name> "..."
```

`claude-query` fetches the field schema (including linked tables and select options). For Airtable, Claude generates a `filterByFormula` expression.

**Examples:**

```bash
claude-query --source airtable://app123/Projects "Projects due before next Friday"
claude-query --source airtable://app123/Projects "Records where Budget is over 50000"
claude-query --source airtable://app123/Projects "Active projects owned by the Design team"
claude-query --source airtable://app123/Projects "Projects linked to client Acme"
claude-query --source airtable://app123/Projects "Count of projects per status" --output csv
```

---

## Query safety

`claude-query` never executes destructive queries. Two layers protect your data:

1. **Soft gate** — the system prompt instructs Claude to generate `SELECT` statements only, never `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `CREATE`, or `TRUNCATE`.
2. **Hard gate** — before execution, the generated SQL is parsed with `node-sql-parser`. Anything that is not a single `SELECT` is rejected. This is the authoritative gate; Claude's instruction is only advisory.

The constructed query is always printed before results, and `--dry-run` lets you review it without executing.

---

## Data governance: `--schema-only`

For environments where production data cannot be shared, `--schema-only` sends Claude **only the schema** — never any row data. In this mode the tool asks Claude to describe the query it *would* run, without executing it:

```bash
claude-query --source postgres://prod/customers --schema-only \
  "Which customers churned last quarter?"
```

This addresses the most common enterprise objection — *"we can't give you production data access"* — while still demonstrating that Claude understands the data model.

---

## Known limitations

- No JOINs across adapters — each data source is queried independently.
- Notion relation queries are limited to IDs.
- CSV/JSON filtering happens in memory, so very large files are bounded by available memory.

---

## Documentation

- [`docs/product-backlog.json`](./docs/product-backlog.json) — epics, features, and user stories with acceptance criteria.
- [`docs/test-plan.json`](./docs/test-plan.json) — test cases traced to backlog elements.
- [`docs/software-architecture.md`](./docs/software-architecture.md) — runtime architecture, design decisions, and engineering challenges.

---

*claude-query — FDE side project · Sola Samuel · v1.0, May 2026*
