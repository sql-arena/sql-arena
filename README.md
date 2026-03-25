# SQL Arena

SQL Arena is the publishing site for benchmark and query-plan results produced with `dbprove`.
The site is a statically generated SvelteKit app, but most of the interesting logic lives in the
data-loading pipeline that turns contributed CSV files into a local DuckDB database.

## What Is In This Repo

- `src/routes/`: SvelteKit pages. The app is prerendered and `csr = false`, so pages are generated at build time.
- `src/lib/db.ts`: the main read layer. It opens `data/dbprove.duckdb` in read-only mode, runs SQL from `src/lib/sql/`, enriches rows with linked objects, and loads markdown content.
- `src/lib/sql/`: query files imported with `?raw`.
- `src/content/markdown/`: theorem commentary and blog posts.
- `etl/`: scripts and SQL used to rebuild `data/dbprove.duckdb` from raw `dbprove` result files.
- `data/dbprove-results/`: git submodule containing contributed benchmark artifacts.
- `scripts/fix-links.ts`: post-build rewrite so the static site works with relative links.

## Quick Start

```sh
npm install
git submodule update --init data/dbprove-results
npm run dev
```

Useful commands:

- `npm run dev`: starts the site using the current `data/dbprove.duckdb`.
- `npx tsx etl/load-dbprove.ts`: rebuilds `data/dbprove.duckdb` from `data/dbprove-results`.
- `npm run build`: rebuilds the DuckDB file first via `prebuild`, then builds the static site and fixes links.
- `npm run check`
- `npm run lint`
- `npm run test`

If `data/dbprove.duckdb` does not exist yet, run `npx tsx etl/load-dbprove.ts` before starting the dev server.

## Data Flow

1. Raw `dbprove` CSV files live under [`data/dbprove-results`](./data/dbprove-results/README.md).
2. `etl/load-dbprove.ts` updates that submodule, recreates `data/dbprove.duckdb`, stages all CSV files, and runs the transform/ranking/blog SQL scripts.
3. Route loaders call helpers in `src/lib/db.ts`.
4. Those helpers execute SQL from `src/lib/sql/` and combine the result with markdown from `src/content/markdown/`.
5. SvelteKit prerenders the final static pages.

## Notes For Future Agents

- Read [CONVENTIONS.md](./CONVENTIONS.md) before making changes.
- `npm run dev` does not rebuild the benchmark database. If result files or ETL SQL changed, rerun `npx tsx etl/load-dbprove.ts` or `npm run build`.
- `etl/load-dbprove.ts` pulls `data/dbprove-results` with `git submodule update --init --remote ...` before loading data. If you are debugging data issues, remember the ETL can move the submodule.
- Only `*.csv` files in `data/dbprove-results` are ingested. `submission.md` files are documentation for humans.
- Generated artifacts in `data/` are expected during local work: `dbprove.duckdb`, `dbprove.duckdb.wal`, and sometimes other scratch databases.
- The site reads markdown directly from disk in development and falls back to bundled raw imports in a static build.
- Deployment is a zip-and-upload flow driven by `npm run deploy` and requires `SQL_ARENA_FTP_USER` plus `SQL_ARENA_FTP_PWD`.

## Conventions

Repo-specific conventions and patterns live in [CONVENTIONS.md](./CONVENTIONS.md).
