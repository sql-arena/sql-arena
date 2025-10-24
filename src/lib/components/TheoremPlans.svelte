<script lang="ts">
	import {DataEngine, DataQueryPlan} from '$lib/components';
	export let data: Array<{engine: string, version: string, plan: string}> = []
</script>

<table class="data">
	<caption>Query Plan per Engine <a class="help" href="/legend/query-plan">?</a></caption>
	<thead>
	<tr>
		<th class="grouped"></th>
		<th>Query Plan</th>
	</tr>
	</thead>
	<tbody>
		{#each data as {engine, version, plan}}
			<tr>
				<td class="grouped"><DataEngine engine="{engine}"/></td>
				<td><DataQueryPlan plan="{plan}"/></td>
			</tr>
		{/each}
	</tbody>
</table>