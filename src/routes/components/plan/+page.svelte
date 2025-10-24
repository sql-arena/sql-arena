<script lang="ts">
	import {  EngineTier, TagPicker, DataText } from '$lib/components';
	import type { Component, Tag } from '$lib/arena-types.js';

	export let data: {
		tags: Tag[],
		planScore: PlanScoreElement[],
		operators: string[],
		component: Component
	};
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

<!-- TODO: This should probably be a component -->
<table class="data">
	<thead>
	<tr>
		<th>Rank</th>
		<th class="sticky"><DataText bigValue="Scan"/></th>
		<th class="sticky"><DataText bigValue="Join Probe" smallValue="Join"/></th>
		<th class="sticky"><DataText bigValue="Sort"/></th>
		<th class="sticky"><DataText bigValue="Hash Build" smallValue="Hash"/></th>
		<th class="sticky"><DataText bigValue="Aggregate" smallValue="Agg"/></th>
		<th class="sticky"><DataText bigValue="Distribute" smallValue="Dist"/></th>
	</tr>
	</thead>
	<tbody>
	{#each data.planScore as score, index}
	<tr>
		<td class="rank vcenter">{index + 1}</td>
		{#each data.operators as op}
		<td class="vcenter">
			{#each score[op] as engine}
			<a href="/engines/{engine.slug}/components/plan/"><EngineTier engine="{engine}" /></a>
			{/each}
		</td>
		{/each}
		<td>Soon</td>
	</tr>
	{/each}
	</tbody>
</table>

<h2>Explore Workloads</h2>
<TagPicker component={data.component} tags={data.tags} />
