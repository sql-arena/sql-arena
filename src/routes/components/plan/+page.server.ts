import { fetchPlanScores, fetchTagsPerComponent, fetchTierListPlan } from '$lib/db';
import { ESTIMATE_CATEGORIES, operation_map } from '$lib/render-maps';


export type PlanScoreElement = {
	join: string[],
	aggregate: string[],
	sort: string[],
	hash: string[],
	scan: string[]
} & { [key: string]: string[] };

export const load = async () => {
	// TODO: Auto generate tier lists once we have enough data to cluster
	// const tierListData = await fetchTierListPlan();
	const tierListData = [
		{engine: "SQL Server", tier: "S"},
		{engine: "ClickHouse", tier: "D"},
		{engine: "DuckDB", tier: "C"},
		{engine: "PostgreSQL", tier: "A"},
		{engine: "Databricks", tier: "F"}
	];
	const tags = await fetchTagsPerComponent('plan');
	const planScoreRows = await fetchPlanScores();
	const featureData = [
		{
			feature: 'Estimated Row Counts',
			importance: 'HIGH',
			engines: [
				{ engine: 'SQL Server', status: 'Yes' },
				{ engine: 'DuckDB', status: 'Partial', comment: 'Missing row counts in filters' },
				{ engine: 'PostgreSQL', status: 'Yes', comment: 'Bug in loop joins' },
				{ engine: 'ClickHouse', status: 'Yes' }
			]
		},
		{
			feature: 'Actual Row Counts',
			importance: 'HIGH',
			engines: [
				{ engine: 'SQL Server', status: 'Yes' },
				{ engine: 'DuckDB', status: 'Partial', comment: 'Missing row counts in filters' },
				{ engine: 'PostgreSQL', status: 'Yes', comment: 'Bug in loop joins' },
				{ engine: 'ClickHouse', status: 'No', comment: 'Only has table counts' }
			]
		},
		{
			feature: 'Statistics Usage',
			importance: 'LOW',
			engines: [
				{ engine: 'SQL Server', status: 'Yes' },
				{ engine: 'ClickHouse', status: 'No', comment: 'Does not appear to use statistics much' }
			]
		},
		{
			feature: 'JSON or XML machine readable EXPLAIN',
			importance: 'HIGH',
			engines: [
				{ engine: 'PostgreSQL', status: 'Yes' },
				{ engine: 'SQL Server', status: 'Yes' },
				{ engine: 'Databricks', status: 'No' },
				{ engine: 'ClickHouse', status: 'Yes'}
			]
		}
	];

		const planScores: Map<number, PlanScoreElement> = new Map<number, PlanScoreElement>();

		for (let i = 0; i < 6; i++) {
			planScores.set(i, { 	join: [],
				aggregate: [],
				sort: [],
				hash: [],
				scan: []});
		}

		planScoreRows.forEach((score) => {
			const rank = Number(score["rank"]) - 1;
			const entry = planScores.get(rank);
			const op  = operation_map.get(score["operation"] as string) ?? "unknown";
			if (entry && op in entry) {
				entry[op].push(score.engine as string);
			}
		});



	return {
		tierListData,
		featureData,
		tags,
		planScore: Array.from(planScores.values()),
		operators: ESTIMATE_CATEGORIES
	};
};
