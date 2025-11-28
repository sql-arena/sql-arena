import { fetchPlanScores, fetchTagsPerComponent, resolveComponent } from '$lib/db';
import { ESTIMATE_CATEGORIES, operation_map } from '$lib/render-maps';
import { type Engine, MAX_RANK } from '$lib/arena-types';

export type PlanScoreElement = {
	join: Engine[];
	aggregate: Engine[];
	sort: Engine[];
	hash: Engine[];
	scan: Engine[];
} & { [key: string]: Engine[] };

export const load = async () => {
	const component = await resolveComponent('plan');
	const tags = [... await fetchTagsPerComponent('plan')
		,{tag:  { tag: "EXPLAIN instrumentation", slug: "instrumentation" }}];
	const planScoreRows = await fetchPlanScores();

	const planScores: Map<number, PlanScoreElement> = new Map<number, PlanScoreElement>();

	const max_found_rank = planScoreRows.reduce((max: number, row) => {
		const rank = Number(row['rank']) || 0;
		return rank > max ? rank : max;
	}, 0);
	for (let i = 0; i < max_found_rank; i++) {
		planScores.set(i, {
			join: [],
			aggregate: [],
			sort: [],
			hash: [],
			scan: []
		});
	}

	await Promise.all(
		planScoreRows.map(async (score) => {
			const rank = Number(score['rank']) - 1;
			const entry = planScores.get(rank);
			const op = operation_map.get(score['operation'] as string) ?? 'unknown';
			if (entry && op in entry) {
				entry[op].push(score.engine as Engine);
			}
		})
	);

	return {
		component: component,
		tags: tags,
		planScore: Array.from(planScores.values()),
		operators: ESTIMATE_CATEGORIES
	};
};
