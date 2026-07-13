import path from 'node:path';
import { fileURLToPath } from 'url';
import { findUpSync } from 'find-up';
import { DuckDBAppender, DuckDBConnection, DuckDBInstance } from '@duckdb/node-api';
import { promises as fs } from 'fs';
import { glob } from 'glob';
import { databasePath } from '../src/lib/paths.server';


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

async function pullSubmodule() {
	const { exec } = await import('child_process');
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
}

interface StagingProofRow {
	engine: string;
	engine_version: string;
	submitter: string;
	file_source: string;
	components: string;
	tags: string;
	theorem: string;
	theorem_display_name: string;
	theorem_description: string;
	theorem_sql: string;
	storage_variant: string;
	proof: string;
	proof_value: string;
	proof_unit: string;
}

function appendStagingRow(appender: DuckDBAppender, row: StagingProofRow) {
	appender.appendVarchar(row.engine);
	appender.appendVarchar(row.engine_version);
	appender.appendVarchar(row.submitter);
	appender.appendVarchar(row.file_source);
	appender.appendVarchar(row.components);
	appender.appendVarchar(row.tags);
	appender.appendVarchar(row.theorem);
	appender.appendVarchar(row.theorem_display_name);
	appender.appendVarchar(row.theorem_description);
	appender.appendVarchar(row.theorem_sql);
	appender.appendVarchar(row.storage_variant);
	appender.appendVarchar(row.proof);
	appender.appendVarchar(row.proof_value);
	appender.appendVarchar(row.proof_unit);
	appender.endRow();
}

function extractSemver(versionStr: string): number[] {
	const match = versionStr.match(/(\d+)\.(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
	if (!match) return [0];
	return match.slice(1).filter(Boolean).map(Number);
}

function compareSemver(a: string, b: string): number {
	const aUnknown = a.toLowerCase() === 'unknown';
	const bUnknown = b.toLowerCase() === 'unknown';
	if (aUnknown && !bUnknown) return -1;
	if (!aUnknown && bUnknown) return 1;
	const va = extractSemver(a);
	const vb = extractSemver(b);
	for (let i = 0; i < Math.max(va.length, vb.length); i++) {
		const diff = (va[i] ?? 0) - (vb[i] ?? 0);
		if (diff !== 0) return diff;
	}
	return 0;
}

async function loadJsonData(conn: DuckDBConnection) {
	const dataDir = path.resolve(repo_root() + 'data/dbprove-results');
	const jsonFiles = await glob('**/*.json', {
		cwd: dataDir,
		absolute: true,
		ignore: ['**/artefacts/**']
	});

	// Pass 1: find the highest version per engine+storageVariant
	const maxVersions = new Map<string, string>();
	for (const file of jsonFiles) {
		const parts = file.split(path.sep);
		const pathVersion = parts[parts.length - 3];
		let data: any;
		try { data = JSON.parse(await fs.readFile(file, 'utf-8')); } catch { continue; }
		if (!data.engine || !data.theorem?.name) continue;
		const engine: string = data.engine;
		const storageVariant: string = data.storageVariant || 'native';
		const version: string = data.version || pathVersion;
		const key = `${engine}|${storageVariant}`;
		const current = maxVersions.get(key);
		if (!current || compareSemver(version, current) > 0) maxVersions.set(key, version);
	}
	console.log('Max versions selected:', Object.fromEntries(maxVersions));

	const IGNORED_TAGS = new Set(['PLAN-JOIN']);
	const IGNORED_ENGINES = new Set(['Yellowbrick']);

	const appender = await conn.createAppender('proof', 'staging');
	let fileCount = 0;
	let rowCount = 0;
	// Track (engine|storageVariant|normalizedTheoremName) to skip duplicate files
	// that arise when both an old-format (JOB-10A) and new-format (PLAN-JOB-10A) file exist.
	const staged = new Set<string>();

	for (const file of jsonFiles) {
		const parts = file.split(path.sep);
		const submitter = parts[parts.length - 2];
		const pathVersion = parts[parts.length - 3];

		let data: any;
		try {
			const content = await fs.readFile(file, 'utf-8');
			data = JSON.parse(content);
		} catch (e) {
			console.error(`Cannot parse JSON: ${file}: ${e}`);
			continue;
		}

		if (!data.engine || !data.theorem?.name) continue;

		const engine: string = data.engine;
		if (IGNORED_ENGINES.has(engine)) continue;
		const engineVersion: string = data.version || pathVersion;
		const storageVariant: string = data.storageVariant || 'native';
		const key = `${engine}|${storageVariant}`;
		if (engineVersion !== maxVersions.get(key)) continue;

		// Normalize old-format theorem names: JOB-* in a PLAN category → PLAN-JOB-*
		// Some older files used bare JOB-10A instead of PLAN-JOB-10A as the theorem name.
		const rawTheoremName: string = data.theorem.name;
		const theoremCategories: string[] = data.theorem.categories as string[] || [];
		const theoremName: string =
			theoremCategories.includes('PLAN') && /^JOB-/i.test(rawTheoremName)
				? 'PLAN-' + rawTheoremName
				: rawTheoremName;
		const theoremDisplayName: string = data.theorem.displayName || rawTheoremName;
		const theoremDescription: string = data.theorem.description || '';
		const components: string = (data.theorem.categories as string[] || []).join(', ');
		const theoremTags: string[] = data.theorem.tags as string[] || [];
		if (theoremTags.some((t) => IGNORED_TAGS.has(t))) continue;
		const tags: string = theoremTags.join(', ');

		const okQueries: any[] = (data.queries as any[] || []).filter((q) => q.status === 'OK');
		if (okQueries.length === 0) continue;

		const stagedKey = `${engine}|${storageVariant}|${theoremName}`;
		if (staged.has(stagedKey)) continue;
		staged.add(stagedKey);

		const theoremSql: string = okQueries[0]?.sql || '';

		const base: Omit<StagingProofRow, 'proof' | 'proof_value' | 'proof_unit'> = {
			engine,
			engine_version: engineVersion,
			submitter,
			file_source: file,
			components,
			tags,
			theorem: theoremName,
			theorem_display_name: theoremDisplayName,
			theorem_description: theoremDescription,
			theorem_sql: theoremSql,
			storage_variant: storageVariant,
		};

		function emit(proof: string, proofValue: string, proofUnit: string) {
			appendStagingRow(appender, { ...base, proof, proof_value: proofValue, proof_unit: proofUnit });
			rowCount++;
		}

		for (const query of okQueries) {
			if (query.sql) emit('SQL', query.sql, 'Query');
			if (query.plan) emit('Plan', query.plan, 'Plan');

			const operatorRows: Record<string, number> = query.operatorRows || {};
			for (const [op, count] of Object.entries(operatorRows)) {
				if (count === -1) continue;
				const opName = op.charAt(0).toUpperCase() + op.slice(1);
				emit(opName, String(count), 'Rows');
			}

			const misEstimates: Record<string, Record<string, number>> = query.misEstimates || {};
			for (const [op, buckets] of Object.entries(misEstimates)) {
				const opName = op.charAt(0).toUpperCase() + op.slice(1);
				for (const [bucket, count] of Object.entries(buckets)) {
					if (count === -1) continue;
					emit(`Mis-estimate ${opName} ${bucket}`, String(count), 'Magnitude');
				}
			}
		}

		// Runtime summary (one row per metric, aggregated across runs)
		const runtime = data.runtime;
		if (runtime) {
			if (runtime.avgMs    != null && runtime.avgMs    !== -1) emit('AvgMs',   String(runtime.avgMs),   'ms');
			if (runtime.minMs    != null && runtime.minMs    !== -1) emit('MinMs',   String(runtime.minMs),   'ms');
			if (runtime.maxMs    != null && runtime.maxMs    !== -1) emit('MaxMs',   String(runtime.maxMs),   'ms');
			if (runtime.bestMs   != null && runtime.bestMs   !== -1) emit('BestMs',  String(runtime.bestMs),  'ms');
			if (runtime.stdDevMs != null && runtime.stdDevMs !== -1) emit('StdDevMs', String(runtime.stdDevMs), 'ms');
		}

		fileCount++;
	}

	appender.flushSync();
	appender.closeSync();
	console.log(`Staged ${rowCount} rows from ${fileCount} JSON files`);
}

async function main() {
	const dbPath = path.resolve(repo_root() + 'data/dbprove.duckdb');

	fs.unlink(dbPath).catch(() => {});

	await pullSubmodule();

	console.log('Repository root:', repo_root());
	console.log(`Creating database at: ${dbPath}`);
	const db = await DuckDBInstance.create(dbPath);
	const conn = await db.connect();

	await runFile(conn, 'schema/staging.sql');
	await runFile(conn, 'schema/dim.sql');
	await runFile(conn, 'schema/fact.sql');

	await loadJsonData(conn);

	await runFile(conn, 'transform-proof.sql');
	await runFile(conn, 'calculate-rank.sql');
	await runFile(conn, 'blog-entries.sql');

	conn.closeSync();
	db.closeSync();
}

main().catch((err) => {
	console.error('DuckDB error:', err);
	process.exit(1);
});
