<script lang="ts">
	import TierList from '$lib/components/TierList.svelte';
	import TagPicker from '$lib/components/TagPicker.svelte';

	export let data: {
		tierListData: Array<{ name: string; tier: string; score?: number }>
		tags : Array<{ tag: string}>
	};
</script>

<h1>Query Plan Quality Tier List</h1>

<TierList title="Database Performance Rankings" data={data.tierListData} />

<h2>Planner Theorems</h2>

<p>Drill into the details of this analysis</p>

<TagPicker data={data.tags} component="plan" />
