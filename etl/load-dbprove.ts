import path from 'node:path';
import { fileURLToPath } from 'url';
import { findUpSync } from 'find-up';
import { DuckDBConnection, DuckDBInstance } from '@duckdb/node-api';
import { promises as fs } from 'fs';
import { glob } from 'glob';

function repo_root() {
	const __filename = fileURLToPath(import.meta.url);
	const __dirname = path.dirname(__filename);

	const pkgPath = findUpSync('package.json', { cwd: __dirname });
	if (!pkgPath) {
		throw new Error('Could not find package.json');
	}
	return path.dirname(pkgPath) + path.sep;
}

async function runFile(conn: DuckDBConnection, file: string) {
	const fullPath = path.resolve(repo_root() + 'etl/' + file);
	const sql = await fs.readFile(fullPath, 'utf-8');
	console.log(`Executing: ${fullPath}`);
	await conn.run(sql);
}

async function walk(dir: string): Promise<string[]> {
	return glob('**/*.csv', { cwd: dir, absolute: true })
}

async function listData(): Promise<string[]> {
	const { exec } = await import('child_process');
	const dataDir = path.resolve(repo_root() + 'data/dbprove-results');

	// Pull latest results via  git submodule
	await new Promise<void>((resolve, reject) => {
		exec(
			'git submodule update --init --remote data/dbprove-results',
			{ cwd: repo_root() },
			(err) => {
				if (err) reject(err);
				else resolve();
			}
		);
	});

	return await walk(dataDir);
}

async function loadData(conn: DuckDBConnection) {
	const inputFiles = await listData();
	const stageSqlPath = path.resolve(repo_root() + 'etl/stage-proof.sql');
	const stageSqlTemplate = await fs.readFile(stageSqlPath, 'utf-8');

	for (const file of inputFiles) {
		const parts = file.split(path.sep);
		const user = parts[parts.length - 2];
		const version = parts[parts.length - 3];

		const sql = stageSqlTemplate
			.replace(/\[submitter]/g, user)
			.replace(/\[path]/g, file)
			.replace(/\[engine_version]/g, version);
		console.log(`Staging file: ${file}`);
		await conn.run(sql);
	}
}

async function main() {
	const dbPath = path.resolve(repo_root() + 'data/dbprove.duckdb');

	fs.unlink(dbPath).catch(() => {});

	console.log('Repository root:', repo_root());
	console.log(`Creating database at: ${dbPath}`);
	const db = await DuckDBInstance.create(dbPath);
	const conn = await db.connect();

	await runFile(conn, 'schema/staging.sql');
	await runFile(conn, 'schema/dim.sql');
	await runFile(conn, 'schema/fact.sql');

	await loadData(conn);

	await runFile(conn, 'transform-proof.sql');
	conn.closeSync();
	db.closeSync();
}

main().catch((err) => {
	console.error('DuckDB error:', err);
	process.exit(1);
});
