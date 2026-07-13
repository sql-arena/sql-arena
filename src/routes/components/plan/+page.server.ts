import { fetchPlanScores, fetchTagsPerComponent, resolveComponent } from '$lib/db';
import { ESTIMATE_CATEGORIES, operation_map } from '$lib/render-maps';
import type { Engine } from '$lib/arena-types';

export type PlanScoreCell = { [op: string]: Engine[] };

export const load = async () => {
	const component = await resolveComponent('plan');
	const tags = [...await fetchTagsPerComponent('plan'), {tag: {tag: "EXPLAIN instrumentation", slug: "instrumentation"}}];
	const planScoreRows = await fetchPlanScores();

	// One row per rank position; each cell holds the engine+variants at that rank for that operation.
	const planScores = new Map<number, PlanScoreCell>();

	const max_found_rank = planScoreRows.reduce((max, row) => {
		const r = Number(row['rank']) || 0;
		return r > max ? r : max;
	}, 0);

	for (let i = 0; i < max_found_rank; i++) {
		const cell: PlanScoreCell = {};
		for (const op of ESTIMATE_CATEGORIES) cell[op] = [];
		planScores.set(i, cell);
	}

	for (const row of planScoreRows) {
		const rank = Number(row['rank']) - 1;
		const entry = planScores.get(rank);
		const op = operation_map.get(row['operation'] as string);
		if (entry && op) {
			entry[op].push(row.engine as Engine);
		}
	}

	return {
		component,
		tags,
		planScore: Array.from(planScores.values()),
		operators: ESTIMATE_CATEGORIES
	};
};
