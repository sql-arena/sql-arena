import { DuckDBConnection, DuckDBInstance } from '@duckdb/node-api';
import { databasePath } from './paths';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';

export type Row = Record<string, unknown>;
export type Rows = Row[];

export const libDir = path.dirname(fileURLToPath(import.meta.url));
export const sqlDir = path.join(libDir, 'sql');
export const markdownDir = path.join(libDir, '..', 'content', 'markdown');

type Duck = { db: DuckDBInstance, conn: DuckDBConnection };
const g = globalThis as unknown as { __duckdb?: Duck };

async function conn(): Promise<DuckDBConnection> {
	const db = await DuckDBInstance.create(databasePath, {access_mode : "READ_ONLY"});
	const conn = await db.connect();
	if (!g.__duckdb) {
		g.__duckdb = { db, conn };
	}
	return g.__duckdb.conn;
}

export function closeDb(): void {
	try {
	if (g.__duckdb) {
		g.__duckdb.db.closeSync();
		g.__duckdb = undefined;
	}
	}
	catch { /* NOOP */ }
}


export async function loadMarkdown(slug: string) {
	const filePath = path.resolve(markdownDir, `${slug}.md`);
	try {
		await fs.access(filePath);
		return await fs.readFile(filePath, "utf-8");
	} catch {
		return "";
	}
}

function logSql(msg: string): void {
	const logDir = path.join(libDir, '..', 'logs');
	const logFile = path.join(logDir, 'sql.log');
	fs.mkdir(logDir, { recursive: true }).catch(() => {});
	fs.appendFile(logFile, `${new Date().toISOString()} ${msg}\n`).catch(() => {});
}

export async function fetchAll(query: string): Promise<Rows> {
	const cn = await conn()
	logSql(query);
	const reader = await cn.runAndReadAll(query);
	return reader.getRowObjects();
}

function parameterise(sql: string, values: Record<string, string>): string {
	return Object.keys(values).reduce(
		(result, key) => result.replaceAll(`%%${key}%%`, values[key]),
		sql
	);
}

function sqlFilePath(sub_directory: string, file: string): string {
	const sqlPath = path.join(sqlDir, sub_directory);
	return  path.join(sqlPath, `${file}.sql`)
}


async function fetchAllByFile(sub_directory: string, file: string, values: Record<string, string> = {}) {
	const sqlPath = path.join(sqlDir, sub_directory);
	const dataPath = path.join(sqlPath, `${file}.sql`)
	const sql = await parameteriseFile(dataPath, values)
	return await fetchAll(sql);

}

async function parameteriseFile(filePath: string, values: Record<string, string>): Promise<string> {
	const content = await fs.readFile(filePath, 'utf-8');
	return parameterise(content, values);
}

export async function allComponents(): Promise<Rows> {
	const file = sqlFilePath("component", "all");
	return fetchAll(await parameteriseFile(file, {}));
}

export async function fetchTierList(tierList: string) {
	return await fetchAllByFile("tier-list", tierList);
}

export async function fetchTheoremProofData(theorem: string) {
	return await fetchAllByFile("theorem", "proof-data", { theorem : theorem})
}

export async function fetchTagProofData(component: string, tag: string) {
	return await fetchAllByFile("tag", "proof-data", { component : component, tag : tag})
}

export async function fetchTheoremTags(component: string, theorem: string) {
	return await fetchAllByFile("theorem", "tag", { theorem : theorem, component: component})
}

export async function fetchTagsPerComponent(component: string) {
	return await fetchAllByFile("theorem", "tags-per-component", { component : component})
}

export async function fetchTheoremPlanData(theorem: string) {
	return await fetchAllByFile("theorem", "proof-plan-data", { theorem : theorem})
}

export async function fetchEngineProofDataByTag(engine: string, tag: string) {
	return await fetchAllByFile("engine", "proof-data-by-tag", { engine : engine, tag: tag})
}
