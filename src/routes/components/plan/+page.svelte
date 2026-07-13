<script lang="ts">
	import { TagPicker, PlanRankTable } from '$lib/components';
	import type { PlanRankRow } from '$lib/components/PlanRankTable.svelte';
	import { ESTIMATE_CATEGORIES } from '$lib/render-maps.js';
	import type { Component, Tag } from '$lib/arena-types';
	import type { PlanScoreCell } from './+page.server';

	export let data: {
		tags: Array<{tag: Tag}>,
		planScore: PlanScoreCell[],
		operators: string[],
		component: Component
	};

	const planRows: PlanRankRow[] = data.planScore.map(score =>
		Object.fromEntries(ESTIMATE_CATEGORIES.map(op => [op, (score[op] ?? []).map(e => ({ engine: e }))]))
	);
</script>

<h1><a href="/components">Component</a> &mdash; Planner</h1>
<article>
	<p>
		Focusing on the big ticket items that bring your <b>big-O</b> complexity down.
		This section is all about the shapes of query plans and the power of the
		query optimiser.
	</p>
</article>

<h2>Query Planner &mdash; Leaderboard</h2>

<article>
	<p>
		The Query plan quality is measured by the amount of operations that the database must
		perform while executing the plan.
	</p>
	<p>Database Engines are ranked by running individual queries from various datasets.
		The best scorer for each query and operation gets 5 points,
		second best: 4, etc... If you are not in the top 5, you get zero points.
		All scores per query are then added up to form the final score below.
	</p>
</article>

<PlanRankTable rows="{planRows}" component="{data.component}" />

<h2>Explore Workloads</h2>
<TagPicker component={data.component} tags={data.tags} />
