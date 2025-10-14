<script lang="ts">
	import TierList from '$lib/components/TierList.svelte';
	export let data: {
		tierListData: Array<{ name: string; tier: string; score?: number }>
	};
</script>

<h1>Query Plan Quality Tier List</h1>


<TierList
	title="Database Performance Rankings"
	data={data.tierListData}
/>



<h1>EXPLAIN Feature Tier List</h1>
