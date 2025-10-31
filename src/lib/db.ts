import { type DuckDBConnection, DuckDBInstance } from '@duckdb/node-api';
import { databasePath } from './paths.server';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import componentAll from './sql/component/all.sql?raw';
import engineAll from './sql/engine/all.sql?raw';
import tagAll from './sql/tag/all.sql?raw';
import blogAll from './sql/blog/all.sql?raw';
import blogTitle from './sql/blog/title.sql?raw';
import tierListPlan from './sql/tier-list/plan-quality.sql?raw';
import theoremAll from './sql/theorem/all.sql?raw';
import theoremTag from './sql/theorem/tag.sql?raw';
import theoremProofData from './sql/theorem/proof-data.sql?raw';
import theoremProofDataPlan from './sql/theorem/proof-data-plan.sql?raw';
import theoremPerComponent from './sql/theorem/per-component.sql?raw';
import tagPerComponent from './sql/tag/per-component.sql?raw';
import engineProofDataByTag from './sql/engine/proof-data-by-tag.sql?raw';
import { Marked, marked } from 'marked';
import {markedHighlight} from 'marked-highlight';
import hljs from "highlight.js";
import tagProofDataSummary from './sql/tag/proof-data-summary.sql?raw';
import engineProofDataSummary from './sql/engine/proof-data-summary.sql?raw';
import tagProofData from './sql/tag/proof-data.sql?raw';
import planScore from './sql/plan/score.sql?raw';
import type { Component, Engine, Tag } from '$lib/arena-types';

export type Row = Record<string, unknown>;
export type Rows = Row[];

export const libDir = path.dirname(fileURLToPath(import.meta.url));
export const sqlDir = path.join(libDir, 'sql');
export const markdownDir = path.join(libDir, '..', 'content', 'markdown');

const g = globalThis as unknown as { __duckdb?: DuckDBConnection };

async function grabConn(): Promise<DuckDBConnection> {
	const db = await DuckDBInstance.create(databasePath, { access_mode: 'READ_ONLY' });
	return await db.connect();
}

async function conn(): Promise<DuckDBConnection> {
	if (!g.__duckdb) {
		g.__duckdb = await grabConn();
	}
	return g.__duckdb;
}


export async function loadMarkdown(slug: string, syntax_highlight: boolean = false) {
	const filePath = path.resolve(markdownDir, `${slug}.md`);
	let md = new Marked();
	if (syntax_highlight) {
		md = new Marked(
			markedHighlight({
				langPrefix: 'hljs language-',
				highlight(code, lang) {
					if (lang && hljs.getLanguage(lang)) {
						return hljs.highlight(code, { language: lang }).value;
					}
					return hljs.highlightAuto(code).value;
				}
			})
			// If your highlight() is async, also pass { async: true } to Marked’s ctor
		);
	}

	try {
		const content = await fs.readFile(filePath, 'utf-8');
		return md.parse(content);
	} catch {
		// Fallback for static build / Vite: try importing the raw markdown bundled by the build
		try {
			// relative to `src/lib` — Vite will resolve `?raw` at build time
			const mod = await import(`../content/markdown/${slug}.md?raw`);
			const raw = (mod && (mod as any).default) ?? String(mod);
			return md.parse(raw);
		} catch  {
			return "";
		}
	}
}


function logSql(msg: string): void {
	const logDir = path.join(libDir, '..', 'logs');
	const logFile = path.join(logDir, 'sql.log');
	fs.mkdir(logDir, { recursive: true }).catch(() => {});
	fs.appendFile(logFile, `${new Date().toISOString()} ${msg}\n`).catch(() => {});
}

async function fetchAllRaw(query: string, conn: DuckDBConnection): Promise<Rows> {
	logSql(query);
	const reader = await conn.runAndReadAll(query);
	return reader.getRowObjects();
}

export async function fetchAll(query: string): Promise<Rows> {
	const rows = await fetchAllRaw(query, await conn());
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
	return await fetchAllRaw(componentAll, await grabConn());
}

export async function fetchBlogTitle(slug: string): Promise<string> {
	const rows = await fetchParameterised(blogTitle, { slug });
	if (!rows || rows.length === 0) {
		throw new Error(`No blog row found for slug: ${slug}`);
	}
	const firstRow = rows[0];
	const firstKey = Object.keys(firstRow)[0];
	if (!firstKey) return '';
	const val = firstRow[firstKey];
	return val == null ? '' : String(val);
}

export async function allTheorems(): Promise<Rows> {
	return await fetchAllRaw(theoremAll, await grabConn());
}

export async function allTags(): Promise<Rows> {
	return await fetchAllRaw(tagAll, await grabConn());
}
export async function allEngines(): Promise<Rows> {
	return await fetchAllRaw(engineAll, await grabConn());
}

export async function allBlogs(): Promise<Rows> {
	return await fetchAllRaw(blogAll, await grabConn());
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
const inFlight = new Map<string, Promise<void>>();

async function resolveWithCache<T extends string>(
	type: T,
	key: string,
	fetchFunction: () => Promise<Rows>
): Promise<Row> {
	let cache = caches.get(type);
	if (!cache) {
		console.log(`Constructing cache of type: ${type}`)
		cache = new Map();
		caches.set(type, cache);
	}

	if (cache.size === 0) {
		let inflight = inFlight.get(type);
		if (!inflight) {
			inflight = (async () => {
				const items = await fetchFunction();
				items.forEach((row) => {
					cache!.set(String(row.slug).toLowerCase(), row);
				});
			})();
			inFlight.set(type, inflight);
			await inflight;
			inFlight.delete(type);
		} else {
			await inflight; // wait for the other one
		}
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
