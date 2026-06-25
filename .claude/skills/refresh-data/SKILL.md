---
name: refresh-data
description: Pull latest benchmark results from the dbprove-results submodule and rebuild the DuckDB database
---

# Refresh Data

Pull the latest results from the `sql-arena-results` / `dbprove-results` submodule and rebuild the DuckDB database.

## Steps

Run these two commands in sequence from the repo root (`/Users/thomaskejser/source/sql-arena`):

### 1. Pull latest results

```bash
git -C data/dbprove-results pull origin main
```

This updates `data/dbprove-results` (the submodule pointing to `https://github.com/thomaskejser/dbprove-results.git`) to the latest commit on `main`.

### 2. Rebuild the database

```bash
npx tsx etl/load-dbprove.ts
```

This:
- Drops and recreates `data/dbprove.duckdb`
- Stages all CSV and JSON result files from `data/dbprove-results/`
- Runs `etl/transform-proof.sql` and `etl/calculate-rank.sql`
- Prints a summary of staged rows and engines found

Expected output ends with something like:
```
Staged NNNNN rows from NNN JSON files
Executing: .../etl/transform-proof.sql
Executing: .../etl/calculate-rank.sql
Executing: .../etl/blog-entries.sql
```

## Notes

- The dev server does **not** need to be restarted after rebuilding the DB — `fetchAll()` now opens a fresh DuckDB connection per query (no global connection cache).
- If you add a new engine, also add its `.webp` logo to `static/img/logo-dark/` and run `npm run generate:logos` to regenerate `src/lib/logo-dark-assets.ts`.
- After verifying the site locally, commit the updated submodule pointer: `git add data/dbprove-results && git commit -m "Update results submodule"`.
