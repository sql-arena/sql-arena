import { resolveComponent, resolveEngine } from '$lib/db';
import type { Component } from '$lib/arena-types';

export const load = async () => {

	const component: Component = await resolveComponent('plan');
	const SQLServer = await resolveEngine('SQL Server');
	const DuckDB = await resolveEngine('DuckDB');
	const PostgreSQL = await resolveEngine('PostgreSQL');
	const ClickHouse = await resolveEngine('ClickHouse');
	const Databricks = await resolveEngine('Databricks');

	const tierListData = [
		{ engine: SQLServer, tier: 'S' },
		{ engine: ClickHouse, tier: 'D' },
		{ engine: DuckDB, tier: 'C' },
		{ engine: PostgreSQL, tier: 'A' },
		{ engine: Databricks, tier: 'F' }
	];

	const featureData = [
		{
			feature: 'Estimated Row Counts',
			importance: 'HIGH',
			engines: [
				{ engine: SQLServer, status: 'Yes' },
				{ engine: DuckDB, status: 'Partial', comment: 'Missing row counts in filters' },
				{ engine: PostgreSQL, status: 'Yes', comment: 'Bug in loop joins' },
				{ engine: ClickHouse, status: 'Yes' }
			]
		},
		{
			feature: 'Actual Row Counts',
			importance: 'HIGH',
			engines: [
				{ engine: SQLServer, status: 'Yes' },
				{ engine: DuckDB, status: 'Partial', comment: 'Missing row counts in filters' },
				{ engine: PostgreSQL, status: 'Yes', comment: 'Bug in loop joins' },
				{ engine: ClickHouse, status: 'No', comment: 'Only has table counts' }
			]
		},
		{
			feature: 'Statistics Usage',
			importance: 'LOW',
			engines: [
				{ engine: SQLServer, status: 'Yes' },
				{ engine: ClickHouse, status: 'No', comment: 'Does not appear to use statistics much' }
			]
		},
		{
			feature: 'JSON or XML machine readable EXPLAIN',
			importance: 'HIGH',
			engines: [
				{ engine: PostgreSQL, status: 'Yes' },
				{ engine: DuckDB, status: 'Yes' },
				{ engine: SQLServer, status: 'Yes' },
				{ engine: Databricks, status: 'No' },
				{ engine: ClickHouse, status: 'Yes' }
			]
		}
	];

	return {
		tierListData,
		featureData,
		component
	};
}