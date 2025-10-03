import { DuckDBConnection, DuckDBInstance } from '@duckdb/node-api';
import { databasePath } from './paths';


export type Row = Record<string, unknown>;
export type Rows = Row[];


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
	return fetchAll(`SELECT component, description FROM dim.component ORDER BY component`);
}