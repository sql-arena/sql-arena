/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "url";
import { findUpSync } from "find-up";
import { DuckDBInstance } from "@duckdb/node-api";


function repo_root() {
	const __filename = fileURLToPath(import.meta.url);
	const __dirname = path.dirname(__filename);

	const pkgPath = findUpSync("package.json", { cwd: __dirname });
	if (!pkgPath) {
		throw new Error("Could not find package.json");
	}
	return path.dirname(pkgPath) + "/";
}

async function main() {
  const dbPath = path.resolve(repo_root() + "data/dbprove.duckdb");
  const outDirData = path.resolve("data");
  const outDirStatic = path.resolve("static", "data");

  fs.mkdirSync(outDirData, { recursive: true });
  fs.mkdirSync(outDirStatic, { recursive: true });
	console.log(`Creating staging database at ${dbPath}`);
  const db = await DuckDBInstance.create(dbPath);
  const conn = await db.connect();

	await conn.run(`
		CREATE SCHEMA IF NOT EXISTS staging;
	`);

	console.log(`Staging created`);
	conn.closeSync();
	db.closeSync();
}

main().catch((err) => {
	console.error("DuckDB error:", err);
	process.exit(1);
});

