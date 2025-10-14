import { DuckDBConnection, DuckDBInstance } from '@duckdb/node-api';
import { databasePath } from './paths';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';

export type Row = Record<string, unknown>;
export type Rows = Row[];

export const libDir = path.dirname(fileURLToPath(import.meta.url));
export const sqlDir = path.join(libDir, 'sql');

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

export async function fetchAll(query: string): Promise<Rows> {
	const cn = await conn()
	const reader = await cn.runAndReadAll(query);
	return reader.getRowObjects();
}


export async function allComponents(): Promise<Rows> {
	// TODO: need to agree with myself if this is component or category
	return fetchAll(`SELECT category AS component, description FROM category ORDER BY ordering`);
}


export async function fetchTierList(tierList: string) {
	const sqlPath = path.join(sqlDir, "tier-list");
	const tierPath = path.join(sqlPath, `${tierList}.sql`)
	const sql = await fs.readFile(tierPath, 'utf-8');
	return await fetchAll(sql);
}