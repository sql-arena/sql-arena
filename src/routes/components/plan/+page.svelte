<script lang="ts">
	import TierList from '$lib/components/TierList.svelte';
	import TagPicker from '$lib/components/TagPicker.svelte';
	import EngineTier from '$lib/components/EngineTier.svelte';
	import ImgEngine from '$lib/components/ImgEngine.svelte';
	import type { Engine, Tag } from '$lib/arena-types.js';

	export let data: {
		tierListData: Array<{ name: string; tier: string; score?: number }>,
		featureData: Array<{
			feature: string;
			importance,
			engines: Array<{ engine: Engine; status: string, comment?: string }>
		}>,
		tags: Array<{ tag: Tag }>,
		planScore: PlanScoreElement[],
		operators: string[]
	};
</script>

<h1>Planner Component</h1>
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
		<th class="rotate-to-shrink">Scanning</th>
		<th class="rotate-to-shrink">Joining</th>
		<th class="rotate-to-shrink">Sorting</th>
		<th class="rotate-to-shrink">Hash Building</th>
		<th class="rotate-to-shrink">Aggregating</th>
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
	</tr>
	{/each}
	</tbody>
</table>

<h2>Query Plan Instrumentation &mdash; Tier List</h2>

<article>
	<p>Database engines are not born equal when it comes to query plan instrumentation.
	</p>
	<p>DBProve does its best to extract and normalise plans. When writing the code to
		do this plan normalisation you learn a lot about what is contained in <code>EXPLAIN</code>
		for each database engine.

		Hence, we can make the following tier list from those experiences.</p>
</article>

<TierList title="Database Performance Rankings" data={data.tierListData} />


<h2>Instrumentation Tier List Ranking</h2>
<article>
	<p>The following table lists the features in each database engine as of the latest
		knowledge present in DBProve and consulting the vendor documentation.

		Vendors are very welcome to comment and correct mistakes. We also hope this table serves
		as inspiration for database vendors to improve their query plan instrumentation.
	</p>
	<p>
		A total of {data.featureData.length} features are evaluated (see below) and scored based
		on importance. High scores cause higher tier rankings.

	</p>
</article>

<table class="data">
	<thead>
	<tr>
		<th class="grouped">Feature</th>
		<th class="grouped">Importance</th>
		<th class="grouped">Engine</th>
		<th>Status</th>
	</tr>
	</thead>
	<tbody>
	{#each data.featureData as feature}
	<tr>
		<td class="grouped" rowspan="{feature.engines.length}">{feature.feature}</td>
		<td class="grouped" rowspan="{feature.engines.length}">{feature.importance}</td>
		<td>
			<ImgEngine engine="{feature.engines[0].engine}"></ImgEngine>
		</td>
		<td title="{feature.engines[0].comment}">{feature.engines[0].status}</td>
	</tr>
	{#each feature.engines as e, index}
	{#if index > 0}
	<tr>
		<td>
			<EngineTier engine="{e.engine}"></EngineTier>
		</td>
		<td title="{e.comment}">{e.status}</td>
	</tr>
	{/if}
	{/each}
	{/each}
	</tbody>
</table>
