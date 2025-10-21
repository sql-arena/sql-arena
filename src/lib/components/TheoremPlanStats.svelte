<script lang="ts">
	import { ESTIMATE_CATEGORIES } from '$lib/render-maps.js';

	export let data:
	 Array<{
				description: string,
				proof: string,
				unit: string,
				value: string,
				/* We can either group by engine or by theorem (or both), depending on the context. */
				engine?: string,
				version?: string,
				theorem?: string
			}>;
	export let tag: string = ""

	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import type { MisEstimate } from '$lib/arena_types';
	import EstimateMagnitudeGraph from '$lib/components/EstimateMagnitudeGraph.svelte';
	import EngineData from '$lib/components/EngineData.svelte';
	import LinkTheorem from '$lib/components/LinkTheorem.svelte';
	import { formatRows } from '$lib/format';


	let rowData = new SvelteMap<string, {
		theorem?: string,
		grouping: string,
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

	let distinctEngines = new SvelteSet<string>();
	let grouping: string = "unknown";
	let key: string = ""
	for (let entry of data) {
		if (entry.engine && entry.theorem) {
			grouping = "both";
			key = entry.engine + " " + entry.theorem;
		}
		else if (entry.engine) {
			grouping = "engine";
			key = entry.engine;
		}
		else if (entry.theorem) {
			grouping = "theorem";
			key = entry.theorem;
		}
		if (!rowData.has(key)) {
			rowData.set(key, {});
		}

		let values = rowData.get(key);
		values.grouping = grouping;
		values.engine = entry.engine
		values.theorem = entry.theorem
		distinctEngines.add(entry.engine ?? "");

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

	let engineCount = distinctEngines.size;

	$ : sortedEngineRow = (Array.from(rowData.entries())).sort((a, b) => {
		const theoremCompare = (a[1].theorem) ? a[1].theorem.localeCompare(b[1].theorem) : 0;
		return theoremCompare !== 0 ? theoremCompare : a[1].engine.localeCompare(b[1].engine);
	});


</script>


<table class="data">
	<thead>
	<tr>
		{#if grouping === "both" || grouping === "theorem"}
		<th rowspan="2" class="text grouped">Theorem</th>
		{/if}
		{#if grouping === "both" || grouping === "engine"}
		<th rowspan="2" class="text grouped">Engine</th>
		{/if}
		<th colspan="2">Scanning</th>
		<th colspan="2">Joining</th>
		<th colspan="2">Sorting</th>
		<th colspan="2">Hash Building</th>
		<th colspan="2">Aggregating</th>
	</tr>
	<tr>
		{#each ESTIMATE_CATEGORIES}
		<th class="sub-header">Rows Processed</th>
		<th class="sub-header">Estimation Accuracy</th>
		{/each}
	</tr>
	</thead>
	<tbody>
		{#each sortedEngineRow as [key, data], index}
		<tr>
			{#if grouping === "both" || grouping === "theorem"}
			{#if index === 0 || sortedEngineRow[index - 1][1].theorem !== data.theorem}
			<td class="grouped" rowspan="{engineCount}">
				<LinkTheorem theorem="{data.theorem}" component="plan"/>
			</td>
			{/if}
			{/if}
			{#if grouping === "both" || grouping === "engine"}
			<td class="grouped">
				<EngineData engine="{data.engine}" tag="{tag}"/>
			</td>
			{/if}
			<td class="table-number">{formatRows(data.scan)}</td>
			<td><EstimateMagnitudeGraph data="{data.mis_estimates?.scan ?? null}"></EstimateMagnitudeGraph></td>
			<td class="table-number">{formatRows(data.join)}</td>
			<td><EstimateMagnitudeGraph data="{data.mis_estimates?.join ?? null}"></EstimateMagnitudeGraph></td>
			<td class="table-number">{formatRows(data.sort)}</td>
			<td><EstimateMagnitudeGraph data="{data.mis_estimates?.sort ?? null}"></EstimateMagnitudeGraph></td>
			<td class="table-number">{formatRows(data.hash)}</td>
			<td><EstimateMagnitudeGraph data="{data.mis_estimates?.hash ?? null}"></EstimateMagnitudeGraph></td>
			<td class="table-number">{formatRows(data.aggregate)}</td>
			<td><EstimateMagnitudeGraph data="{data.mis_estimates?.aggregate ?? null}"></EstimateMagnitudeGraph></td>
		</tr>
		{/each}
	</tbody>
</table>