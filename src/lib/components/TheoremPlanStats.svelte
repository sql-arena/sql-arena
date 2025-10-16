<script lang="ts">
	export let data:
		Array<
			{
				description: string,
				proof: string,
				unit: string,
				value: string,
				engine: string,
				version: string
			}> =  [];

	import { SvelteMap } from 'svelte/reactivity';
	import EstimateMagnitude from '$lib/components/EstimateMagnitude.svelte';
	import EngineData from '$lib/components/EngineData.svelte';
	import type { MisEstimate } from '$lib/arena_types';


	let engineRowData = new SvelteMap<string, {
		join: number,
		aggregate: number,
		sort: number,
		hash: number,
		scan: number,
		distribution: number,
		mis_estimates:
			{
				join : MisEstimate[],
				scan: MisEstimate[],
				sort: MisEstimate[],
				hash: MisEstimate[],
				aggregate: MisEstimate[],
				distribution: MisEstimate[]
			}
	}>();


	const ESTIMATE_CATEGORIES = ['join', 'aggregate', 'sort', 'hash', 'scan'];
	for (let entry of data) {
		if (!engineRowData.has(entry.engine)) {
			engineRowData.set(entry.engine, {});
		}
		let engine_data = engineRowData.get(entry.engine);
		const proofLower = entry.proof.toLowerCase();
		if (ESTIMATE_CATEGORIES.includes(proofLower)) {
			engine_data[proofLower] = parseInt(entry.value);
			continue;
		}

		if (entry.proof.startsWith("Mis-estimate")) {
			let parts = entry.proof.split(" ")
			let c = parseInt(entry.value)
			let m = parts[2]
			if (!engine_data.mis_estimates) {
				engine_data.mis_estimates = Object.fromEntries(
					ESTIMATE_CATEGORIES.map(cat => [cat, []])
				);
			}
			const op = parts[1].toLowerCase();
			if (engine_data.mis_estimates[op]) {
				engine_data.mis_estimates[op].push({magnitude: m, count: c});
			}
		}
	}

  $ : sortedEngineRow = (Array.from(engineRowData.entries())).sort((a, b) => a[0].localeCompare(b[0]));


</script>

<h2>Plan Efficiency and Estimation</h2>
<table class="data">
	<thead>
	<tr>
		<th rowspan="2" class="text grouped">Engine</th>
		<th colspan="2">Scanning</th>
		<th colspan="2">Joining</th>
		<th colspan="2">Sorting</th>
		<th colspan="2">Hash Building</th>
		<th colspan="2">Aggregating</th>
	</tr>
	<tr>
		{#each ESTIMATE_CATEGORIES}
		<th class="sub-header">Rows</th>
		<th class="sub-header">Estimation</th>
		{/each}
	</tr>
	</thead>
	<tbody>
		{#each sortedEngineRow as [engine, data]}
		<tr>
			<td class="grouped"><EngineData engine="{engine}"/></td>
			<td class="table-number">{data.scan}</td>
			<td><EstimateMagnitude data="{data.mis_estimates?.scan ?? null}"></EstimateMagnitude></td>
			<td class="table-number">{data.join}</td>
			<td><EstimateMagnitude data="{data.mis_estimates?.join ?? null}"></EstimateMagnitude></td>
			<td class="table-number">{data.sort}</td>
			<td><EstimateMagnitude data="{data.mis_estimates?.sort ?? null}"></EstimateMagnitude></td>
			<td class="table-number">{data.hash}</td>
			<td><EstimateMagnitude data="{data.mis_estimates?.hash ?? null}"></EstimateMagnitude></td>
			<td class="table-number">{data.aggregate}</td>
			<td><EstimateMagnitude data="{data.mis_estimates?.aggregate ?? null}"></EstimateMagnitude></td>
		</tr>
		{/each}
	</tbody>
</table>