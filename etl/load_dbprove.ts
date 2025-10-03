import path from "node:path";
import { fileURLToPath } from "url";
import { findUpSync } from "find-up";
import { DuckDBConnection, DuckDBInstance } from "@duckdb/node-api";
import { promises as fs } from 'fs';

function repo_root() {
	const __filename = fileURLToPath(import.meta.url);
	const __dirname = path.dirname(__filename);

	const pkgPath = findUpSync("package.json", { cwd: __dirname });
	if (!pkgPath) {
		throw new Error("Could not find package.json");
	}
	return path.dirname(pkgPath) + "/";
}

async function runFile(conn: DuckDBConnection, file : string) {
	const fullPath = path.resolve(repo_root() + 'etl/' + file);
	const sql = await fs.readFile(fullPath, 'utf-8');
	console.log(`Executing: ${fullPath}`);
	await conn.run(sql);
}

async function main() {
  const dbPath = path.resolve(repo_root() + "data/dbprove.duckdb");
  const outDirData = path.resolve("data");
  const outDirStatic = path.resolve("static", "data");
	
  await fs.mkdir(outDirData, { recursive: true });
  await fs.mkdir(outDirStatic, { recursive: true });
	console.log(`Creating database at ${dbPath}`);
  const db = await DuckDBInstance.create(dbPath);
  const conn = await db.connect();

	await runFile(conn, "schema/staging.ddl");
	await runFile(conn, "schema/dim.ddl");
	await runFile(conn, "schema/fact.ddl");

	conn.closeSync();
	db.closeSync();
}

main().catch((err) => {
	console.error("DuckDB error:", err);
	process.exit(1);
});

