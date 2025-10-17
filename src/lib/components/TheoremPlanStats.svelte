<script lang="ts">
	export let data:
	 Array<{
				description: string,
				proof: string,
				unit: string,
				value: string,
				/* We can either group by engine or by theorem, depending on the context. */
				engine?: string,
				version?: string,
				theorem?: string
			}>;
	export let tag: string = ""
	export let is_summary: boolean = false;

	import { SvelteMap } from 'svelte/reactivity';
	import type { MisEstimate } from '$lib/arena_types';
	import EstimateMagnitude from '$lib/components/EstimateMagnitude.svelte';
	import EngineData from '$lib/components/EngineData.svelte';
	import LinkTheorem from '$lib/components/LinkTheorem.svelte';
	import { formatRows } from '$lib/format';


	let rowData = new SvelteMap<string, {
		type: string,
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
		const type = entry.engine ? "engine" : "theorem";
		const key = entry.engine ? entry.engine : entry.theorem;
		if (!rowData.has(key)) {
			rowData.set(key, {});
		}
		let values = rowData.get(key);
		values.type = type;
		const proofLower = entry.proof.toLowerCase();
		if (ESTIMATE_CATEGORIES.includes(proofLower)) {
			values[proofLower] = parseInt(entry.value);
			continue;
		}

		if (entry.proof.startsWith("Mis-estimate")) {
			let parts = entry.proof.split(" ")
			let c = parseInt(entry.value)
			let m = parts[2]
			if (!values.mis_estimates) {
				values.mis_estimates = Object.fromEntries(
					ESTIMATE_CATEGORIES.map(cat => [cat, []])
				);
			}
			const op = parts[1].toLowerCase();
			if (values.mis_estimates[op]) {
				values.mis_estimates[op].push({magnitude: m, count: c});
			}
		}
	}

  $ : sortedEngineRow = (Array.from(rowData.entries())).sort((a, b) => a[0].localeCompare(b[0]));


</script>

<h2>Plan Efficiency and Estimation{#if is_summary}&nbsp;-&nbsp;Summary{/if}</h2>
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
		{#each sortedEngineRow as [key, data]}
		<tr>
			<td class="grouped">
				{#if data.type === "engine"}
				<EngineData engine="{key}" tag="{tag}"/>
				{:else}
				<LinkTheorem theorem="{key}" component="plan"/>
				{/if}
			</td>
			<td class="table-number">{formatRows(data.scan)}</td>
			<td><EstimateMagnitude data="{data.mis_estimates?.scan ?? null}"></EstimateMagnitude></td>
			<td class="table-number">{formatRows(data.join)}</td>
			<td><EstimateMagnitude data="{data.mis_estimates?.join ?? null}"></EstimateMagnitude></td>
			<td class="table-number">{formatRows(data.sort)}</td>
			<td><EstimateMagnitude data="{data.mis_estimates?.sort ?? null}"></EstimateMagnitude></td>
			<td class="table-number">{formatRows(data.hash)}</td>
			<td><EstimateMagnitude data="{data.mis_estimates?.hash ?? null}"></EstimateMagnitude></td>
			<td class="table-number">{formatRows(data.aggregate)}</td>
			<td><EstimateMagnitude data="{data.mis_estimates?.aggregate ?? null}"></EstimateMagnitude></td>
		</tr>
		{/each}
	</tbody>
</table>