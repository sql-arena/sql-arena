import { DuckDBConnection, DuckDBInstance } from '@duckdb/node-api';
import { databasePath } from './paths.server';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import componentAll from './sql/component/all.sql?raw'
import tierListPlan from './sql/tier-list/plan-quality.sql?raw'
import theoremTag from './sql/theorem/tag.sql?raw'
import theoremProofData from './sql/theorem/proof-data.sql?raw'
import theoremProofDataPlan from './sql/theorem/proof-data-plan.sql?raw'
import theoremPerComponent from './sql/theorem/per-component.sql?raw'
import tagPerComponent from './sql/tag/per-component.sql?raw'
import engineProofDataByTag from './sql/engine/proof-data-by-tag.sql?raw'

import tagProofDataSummary from './sql/tag/proof-data-summary.sql?raw'
import tagProofData from './sql/tag/proof-data.sql?raw'
import planScore from './sql/plan/score.sql?raw'

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
export
async function fetchParameterised(file_content: string, values: Record<string, string> = {}) {
	const sql = parameterise(file_content, values)
	return await fetchAll(sql);

}

export async function allComponents(): Promise<Rows> {
	return await fetchParameterised(componentAll, {});
}

export async function fetchTierListPlan() {
	return await fetchParameterised(tierListPlan);
}

export async function fetchTheoremProofData(theorem: string) {
	return await fetchParameterised(theoremProofData, { theorem : theorem})
}

export async function fetchTagProofDataSummary(component: string, tag: string) {
	return await fetchParameterised(tagProofDataSummary, { component : component, tag : tag})
}

export async function fetchTagProofData(component: string, tag: string) {
	return await fetchParameterised(tagProofData, { component : component, tag : tag})
}


export async function fetchTheoremTags(component: string, theorem: string) {
	return await fetchParameterised(theoremTag, { theorem : theorem, component: component})
}

export async function fetchTagsPerComponent(component: string) {
	return await fetchParameterised(tagPerComponent, { component : component})
}

export async function fetchTheoremPlanData(theorem: string) {
	return await fetchParameterised(theoremProofDataPlan, { theorem : theorem})
}

export async function fetchEngineProofDataByTag(engine: string, tag: string) {
	return await fetchParameterised(engineProofDataByTag, { engine : engine, tag: tag})
}

export async function fetchTheoremPerComponent(component: string) {
	return await fetchParameterised(theoremPerComponent, { component : component})
}

export async function fetchPlanScores() {
	return await fetchParameterised(planScore, {})
}