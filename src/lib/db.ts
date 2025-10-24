import { type DuckDBConnection, DuckDBInstance } from '@duckdb/node-api';
import { databasePath } from './paths.server';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import componentAll from './sql/component/all.sql?raw';
import engineAll from './sql/engine/all.sql?raw';
import tagAll from './sql/tag/all.sql?raw';
import tierListPlan from './sql/tier-list/plan-quality.sql?raw';
import theoremAll from './sql/theorem/all.sql?raw';
import theoremTag from './sql/theorem/tag.sql?raw';
import theoremProofData from './sql/theorem/proof-data.sql?raw';
import theoremProofDataPlan from './sql/theorem/proof-data-plan.sql?raw';
import theoremPerComponent from './sql/theorem/per-component.sql?raw';
import tagPerComponent from './sql/tag/per-component.sql?raw';
import engineProofDataByTag from './sql/engine/proof-data-by-tag.sql?raw';

import tagProofDataSummary from './sql/tag/proof-data-summary.sql?raw';
import engineProofDataSummary from './sql/engine/proof-data-summary.sql?raw';
import tagProofData from './sql/tag/proof-data.sql?raw';
import planScore from './sql/plan/score.sql?raw';
import type { Tag, Component, Engine } from '$lib/arena-types';

export type Row = Record<string, unknown>;
export type Rows = Row[];

export const libDir = path.dirname(fileURLToPath(import.meta.url));
export const sqlDir = path.join(libDir, 'sql');
export const markdownDir = path.join(libDir, '..', 'content', 'markdown');

type Duck = { db: DuckDBInstance; conn: DuckDBConnection };
const g = globalThis as unknown as { __duckdb?: Duck };

async function conn(): Promise<DuckDBConnection> {
	const db = await DuckDBInstance.create(databasePath, { access_mode: 'READ_ONLY' });
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
	} catch {
		/* NOOP */
	}
}

export async function loadMarkdown(slug: string) {
	const filePath = path.resolve(markdownDir, `${slug}.md`);
	try {
		await fs.access(filePath);
		return await fs.readFile(filePath, 'utf-8');
	} catch {
		return '';
	}
}

function logSql(msg: string): void {
	const logDir = path.join(libDir, '..', 'logs');
	const logFile = path.join(logDir, 'sql.log');
	fs.mkdir(logDir, { recursive: true }).catch(() => {});
	fs.appendFile(logFile, `${new Date().toISOString()} ${msg}\n`).catch(() => {});
}

async function fetchAllRaw(query: string): Promise<Rows> {
	const cn = await conn();
	// logSql(query);
	const reader = await cn.runAndReadAll(query);
	return reader.getRowObjects();
}

export async function fetchAll(query: string): Promise<Rows> {
	const rows = await fetchAllRaw(query);
	return await Promise.all(
		rows.map(async (row) => {
			const updatedRow: Record<string, unknown> = { ...row };
			/* Why? Svelte and framework in general expect objects to be returned
			 * By enriching the data with some slug data, we can easily link to other entities
			 * in the rendering code
			 * */
			if (row.tag) {
				updatedRow.tag = await resolveTag(String(row.tag));
			}
			if (row.component) {
				updatedRow.component = await resolveComponent(String(row.component));
			}
			if (row.engine) {
				updatedRow.engine = await resolveEngine(String(row.engine));
			}
			if (row.theorem) {
				updatedRow.theorem = await resolveTheorem(String(row.theorem));
			}
			return updatedRow;
		})
	);
}

function parameterise(sql: string, values: Record<string, string>): string {
	return Object.keys(values).reduce(
		(result, key) => result.replaceAll(`%%${key}%%`, values[key]),
		sql
	);
}
export async function fetchParameterised(
	file_content: string,
	values: Record<string, string> = {}
) {
	const sql = parameterise(file_content, values);
	return await fetchAll(sql);
}

export async function allComponents(): Promise<Rows> {
	return await fetchAllRaw(componentAll);
}

export async function allTheorems(): Promise<Rows> {
	return await fetchAllRaw(theoremAll);
}

export async function allTags(): Promise<Rows> {
	return await fetchAllRaw(tagAll);
}
export async function allEngines(): Promise<Rows> {
	return await fetchAllRaw(engineAll);
}

export async function fetchTierListPlan() {
	return await fetchParameterised(tierListPlan);
}

export async function fetchTheoremProofData(theorem: string) {
	return await fetchParameterised(theoremProofData, { theorem: theorem });
}

export async function fetchTagProofDataSummary(component: string, tag: string, engine: string = "ALL") {
	return await fetchParameterised(tagProofDataSummary, { component: component, tag: tag, engine: engine });
}

export async function fetchEngineProofDataSummary(component: string, engine: string) {
	return await fetchParameterised(engineProofDataSummary, { component: component, engine: engine });
}

export async function fetchTagProofData(component: string, tag: string) {
	return await fetchParameterised(tagProofData, { component: component, tag: tag });
}

export async function fetchTheoremTags(component: string, theorem: string) {
	return await fetchParameterised(theoremTag, { theorem: theorem, component: component });
}

export async function fetchTagsPerComponent(component: string) {
	return await fetchParameterised(tagPerComponent, { component: component });
}

export async function fetchTheoremPlanData(theorem: string) {
	return await fetchParameterised(theoremProofDataPlan, { theorem: theorem });
}

export async function fetchEngineProofDataByTag(engine: string, tag: string) {
	return await fetchParameterised(engineProofDataByTag, { engine: engine, tag: tag });
}

export async function fetchTheoremPerComponent(component: string) {
	return await fetchParameterised(theoremPerComponent, { component: component });
}

export async function fetchPlanScores() {
	return await fetchParameterised(planScore, {});
}

const caches: Map<string, Map<string, Row>> = new Map();

async function resolveWithCache<T extends string>(
	type: T,
	key: string,
	fetchFunction: () => Promise<Rows>
): Promise<Row> {
	let cache = caches.get(type);
	if (!cache) {
		cache = new Map();
		caches.set(type, cache);
	}
	if (typeof key !== 'string' || !key.trim()) {
		throw new Error(`Invalid key provided for type: ${type}`);
	}

	if (cache.size === 0) {
		const items = await fetchFunction();
		items.forEach((row) => {
			cache.set(String(row.slug), row);
		});
	}
	const row = cache.get(key.toLowerCase());
	if (!row) {
		throw new Error(`Row not found in cache for type: ${type}, key: ${key}`);
	}
	return row;
}

export async function resolveComponent(component: string): Promise<Component> {
	return (await resolveWithCache('component', component, allComponents)) as Component;
}

export async function resolveTag(tag: string): Promise<Tag> {
	return (await resolveWithCache('tag', tag, allTags)) as Tag;
}

export async function resolveEngine(engine: string): Promise<Engine> {
	return (await resolveWithCache('engine', engine, allEngines)) as Engine;
}

export async function resolveTheorem(theorem: string): Promise<Engine> {
	return (await resolveWithCache('theorem', theorem, allTheorems)) as Engine;
}
