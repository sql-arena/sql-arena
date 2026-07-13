# static/

Static assets served directly at the site root.

## Top-level files

| File | Purpose |
|------|---------|
| `favicon.ico` | Browser tab icon |
| `robots.txt` | Search engine crawl directives |

## img/

All images used by the site.

| Path | Contents |
|------|---------|
| `img/arena-avatar.png` | Avatar used in social/meta tags |
| `img/arena-front.png/.webp` | Hero image for the front page |
| `img/background.png` | Site background texture |
| `img/iceberg.webp` | Iceberg illustration used in blog posts |

### img/logo-dark/

Engine logos optimised for dark backgrounds. All files are **256×256 WebP**.
Filename must match the engine name key used in `src/lib/logo-dark-assets.ts`
(which maps engine names → asset paths and is the single source of truth).

Engines currently present: CedarDB, ClickHouse, Databricks, DataFusion, DuckDB,
MariaDB, Oracle, PostgreSQL, Redshift, Snowflake, Spark, SQL Server, Starburst,
Teradata, Trino.

To add a new logo:
1. Convert/resize to 256×256 WebP: `magick input.png -resize 256x256 EngineName.webp`
2. Drop it here with the filename matching the engine name exactly.
3. Add an entry to `src/lib/logo-dark-assets.ts`.

### img/logo-light/

Engine logos for light backgrounds (legacy set, mixed PNG sizes). Not all engines
are represented here; the dark set is the primary one used in the UI.

### img/posts/

Per-post images and Markdown stubs. Each blog post typically has a paired `.jpg`
(or `.png`) hero image and a `.md` file with metadata/caption. Files are named
after the post slug.
