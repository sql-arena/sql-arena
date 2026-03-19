# Coding Conventions

This document outlines the coding standards and architectural patterns for the `sql-arena` project.

## Architecture & Data Flow

- **Database**: The project uses **DuckDB** for data storage and analysis.
- **SQL Files**: SQL queries are stored in standalone `.sql` files in `src/lib/sql/`. They are imported into TypeScript files using the `?raw` suffix provided by Vite.
- **Data Access**: `src/lib/db.ts` is the central point for database interactions. 
  - Use `fetchAll(query)` for generic result sets.
  - The `fetchAll` function automatically "enriches" rows by resolving slugs (like `tag`, `component`, `engine`) into full objects if they are present in the result set.
- **Markdown**: Content pages are stored in `src/content/markdown`. Use `loadMarkdown(slug)` from `$lib/db` to fetch and parse them.
  - The `loadMarkdown` function returns an object: `{ content: string, metadata: Record<string, any> }`.
  - Blog entries use frontmatter (YAML) for `title` and `publish_date`.

## Naming Conventions

- **Directories & Files**:
  - Use `kebab-case` for directories and files in `src/routes/` (standard SvelteKit).
  - Use `PascalCase` for Svelte components (e.g., `DataEngine.svelte`).
  - Use `camelCase` for TypeScript/JavaScript variables and functions.
- **SQL Result Sets**: 
  - Prefer `snake_case` or `camelCase` consistently with the database schema. `src/lib/db.ts` often maps these to object properties.

## Svelte Components

- Components should be located in `src/lib/components`.
- Use `lang="ts"` in `<script>` tags.
- Props should be clearly typed. Prefer using types from `$lib/arena-types.ts` where possible.
- CSS should be scoped to components or use the global stylesheets in `src/styles/` for shared design tokens.

## Styling

- Global styles and design tokens are located in `src/styles/`.
- Use CSS variables defined in `tokens.css` for colors, spacing, and other constants.

## Directory Structure

- `src/lib/sql/`: SQL query definitions organized by entity.
- `src/lib/components/`: Reusable Svelte UI components.
- `src/content/markdown/`: Static content and blog posts.
- `src/routes/`: SvelteKit page routes.
- `src/styles/`: Global CSS modules.

## Tooling

- **DuckDB**: Ensure you have the necessary DuckDB extensions or setup if working with external data.
- **Vite**: The build system handles raw SQL imports and Svelte compilation.
