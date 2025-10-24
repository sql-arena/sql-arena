<script lang="ts">
	import { TierList, EngineTier, ImgEngine, LinkComponent} from '$lib/components';
	import type { Component } from '$lib/arena-types.js';

	export let data: {
		tierListData: Array<{ name: string; tier: string; score?: number }>,
		featureData: Array<{
			feature: string;
			importance,
			engines: Array<{ engine: Engine; status: string, comment?: string }>
		}>,
		component: Component
	}
</script>

<h1><LinkComponent component="{data.component}"/> &mdash; EXPLAIN Instrumentation</h1>

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
		<th class="text">Feature</th>
		<th>Importance</th>
		<th>Engine</th>
		<th>Status</th>
	</tr>
	</thead>
	<tbody>
	{#each data.featureData as feature}
	<tr>
		<td class="text" rowspan="{feature.engines.length}">{feature.feature}</td>
		<td rowspan="{feature.engines.length}">{feature.importance}</td>
		<td>
			<ImgEngine engine="{feature.engines[0].engine}" class="fit"></ImgEngine>
		</td>
		<td title="{feature.engines[0].comment}"  class="fit">{feature.engines[0].status}</td>
	</tr>
	{#each feature.engines as e, index}
	{#if index > 0}
	<tr>
		<td class="fit">
			<EngineTier engine="{e.engine}"></EngineTier>
		</td>
		<td class="fit">{e.status}</td>
	</tr>
	{/if}
	{/each}
	{/each}
	</tbody>
</table>