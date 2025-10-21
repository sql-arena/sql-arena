<script lang="ts">
	import EngineData from '$lib/components/EngineData.svelte';
	import QueryPlanData from '$lib/components/QueryPlanData.svelte';
	export let data: Array<{engine: string, version: string, plan: string}> = []
</script>

<h2>Actual Query Plans</h2>
<table class="data">
	<thead>
	<tr>
		<th class="text grouped">Engine</th>
		<th>Query Plan</th>
	</tr>
	</thead>
	<tbody>
		{#each data as {engine, version, plan}}
			<tr>
				<td class="text grouped"><EngineData engine="{engine}"/></td>
				<td><QueryPlanData plan="{plan}"/></td>
			</tr>
		{/each}
	</tbody>
</table>