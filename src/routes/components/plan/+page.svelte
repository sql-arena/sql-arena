<script lang="ts">
	import TierList from '$lib/components/TierList.svelte';
	export let data: {
		tierListData: Array<{ name: string; tier: string; score?: number }>
		tags : Array<{ tag: string; theorem_count: number }>
	};
</script>

<h1>Query Plan Quality Tier List</h1>


<TierList
	title="Database Performance Rankings"
	data={data.tierListData}></TierList>


<h2>Planner Theorems</h2>

<p>Drill into the details of this analysis</p>
<ul class="small-selector">
	{#each data.tags as tag}
		<li><a href="/components/plan/{tag.tag.toLowerCase()}">{tag.tag} ({tag.theorem_count} tests)</a></li>
	{/each}
</ul>