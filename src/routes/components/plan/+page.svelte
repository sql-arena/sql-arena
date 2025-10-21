<script lang="ts">
	import TierList from '$lib/components/TierList.svelte';
	import TagPicker from '$lib/components/TagPicker.svelte';
	import EngineTier from '$lib/components/EngineTier.svelte';
	import ImgEngine from '$lib/components/ImgEngine.svelte';

	export let data: {
		tierListData: Array<{ name: string; tier: string; score?: number }>,
		featureData: Array<{ feature: string; importance, engines: Array<{ engine: string; status: string, comment?: string}> }>,
		tags : Array<{ tag: string}>,
		planScore: PlanScoreElement[],
		operators: string[]
	};
</script>

<h1>Query Plan Top Score</h1>

<article>
<p>Database Engines are ranked by theorem. The best scorer for each theorem gets 5 points,
	second best 4, etc... If you are not in the top 5, you get zero points.
All theorems are then added up to form the final score below.
</p>
</article>

<table class="data">
	<thead>
		<tr>
			<th>Rank</th>
			<th>Scanning</th>
			<th>Joining</th>
			<th>Sorting</th>
			<th>Hash Building</th>
			<th>Aggregating</th>
		</tr>
	</thead>
	<tbody>
		{#each data.planScore as score, index}
		<tr>
			<td class="rank vcenter">{index + 1}</td>
			{#each data.operators as op}
			<td class="vcenter">
			{#each score[op] as engine}
				<EngineTier engine="{engine}"/>
			{/each}
			</td>
			{/each}
		</tr>
		{/each}
	</tbody>
</table>


<h2>Planner Theorem Data</h2>

<p>Drill into the details of the analysis above</p>

<TagPicker data={data.tags} component="plan" />

<h1>Query Plan Instrumentation &mdash; Tier List</h1>

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
				<th class="grouped" >Importance</th>
				<th class="grouped" >Engine</th>
				<th>Status</th>
			</tr>
		</thead>
		<tbody>
		{#each data.featureData as feature}
			<tr>
				<td class="grouped" rowspan="{feature.engines.length}">{feature.feature}</td>
				<td class="grouped" rowspan="{feature.engines.length}">{feature.importance}</td>
				<td><ImgEngine engine="{feature.engines[0].engine}"></ImgEngine></td>
				<td title="{feature.engines[0].comment}">{feature.engines[0].status}</td>
			</tr>
		{#each feature.engines as e, index}
		{#if index > 0}
		<tr>
			<td><EngineTier engine="{e.engine}"></EngineTier></td>
			<td title="{e.comment}">{e.status}</td>
		</tr>
		{/if}
		{/each}
		{/each}
		</tbody>
	</table>
