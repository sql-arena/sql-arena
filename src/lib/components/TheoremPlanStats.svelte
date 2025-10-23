<script lang="ts">
	import { ESTIMATE_CATEGORIES } from '$lib/render-maps.js';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import type { Engine, MisEstimate, Tag, Component } from '$lib/arena-types.js';
	import { EngineData, LinkTheorem, LinkTag, EstimateMagnitudeGraph, RowData } from '$lib/components';
	import { formatRows } from '$lib/format';

	export let data:
		Array<{
			proof: string,
			unit: string,
			value: string,
			/* We can either group by engine or by theorem (or both), depending on the context. */
			engine?: Engine,
			version?: string,
			theorem?: string,
			tag?: Tag
		}>;
	export let tag: Tag;
	export let engine: Engine;
	export let component: Component;


	if (!component) {
		throw new Error('component is required');
	}

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
				join: MisEstimate[],
				scan: MisEstimate[],
				sort: MisEstimate[],
				hash: MisEstimate[],
				aggregate: MisEstimate[],
				distribution: MisEstimate[]
			}
	}>();

	let distinctEngines = new SvelteSet<string>();
	let grouping: string = 'unknown';
	let key: string = '';
	for (let entry of data) {
		if (entry.tag) {
			grouping = 'tag';
			key = entry.tag;
		}
		if (entry.engine && entry.theorem) {
			grouping = 'both';
			key = entry.theorem.slug + ':' + entry.engine.slug;
		} else if (entry.engine) {
			grouping = 'engine';
			key = entry.engine.slug;
		} else if (entry.theorem) {
			grouping = 'theorem';
			key = entry.theorem.slug;
		}
		if (!rowData.has(key)) {
			rowData.set(key, {});
		}

		let values = rowData.get(key);
		values.grouping = grouping;
		values.engine = entry.engine;
		values.theorem = entry.theorem;
		if (entry.engine) {
			distinctEngines.add(entry.engine.slug);
		}
		const proofLower = entry.proof.toLowerCase();
		if (ESTIMATE_CATEGORIES.includes(proofLower)) {
			values[proofLower] = parseInt(entry.value);
			continue;
		}

		if (entry.proof.startsWith('Mis-estimate')) {
			let parts = entry.proof.split(' ');
			let c = parseInt(entry.value);
			let m = parts[2];
			if (!values.mis_estimates) {
				values.mis_estimates = Object.fromEntries(
					ESTIMATE_CATEGORIES.map(cat => [cat, []])
				);
			}
			const op = parts[1].toLowerCase();
			if (values.mis_estimates[op]) {
				values.mis_estimates[op].push({ magnitude: m, count: c });
			}
		}
	}

	let engineCount = Math.max(distinctEngines.size, 1);

	$ : sortedEngineRow = (Array.from(rowData.entries())).sort((a, b) => {
		return a[0].localeCompare(b[0]);
	});


</script>

<table class="data">
	<thead>
	<tr>
		{#if grouping === "theorem"}
		<th class="text" style="width:10%">Theorem</th>
		{/if}
		{#if grouping === "engine" || grouping === "both"}
		<th class="text" style="width:10%"></th>
		{/if}
		{#if grouping === "tag" }
		<th class="text">Workload</th>
		{/if}
		<th class="sticky">Scan</th>
		<th class="sticky">Join</th>
		<th class="sticky">Sort</th>
		<th class="sticky">Hash</th>
		<th class="sticky">Agg</th>
		<th class="sticky">Dist</th>
	</tr>
	</thead>
	<tbody>
	{#each sortedEngineRow as [key, data], index}

	{#if grouping === "both" && (index === 0 || sortedEngineRow[index - 1][1].theorem !== data.theorem)}
	<tr>
		<th class="left header-divider" colspan="1">
				<LinkTheorem theorem="{data.theorem}" component="{component}" />
		</th>
		<th colspan="6"></th>

	</tr>
	{/if}

	<tr>
		{#if grouping === "tag"}
		<td class="grouped" rowspan="{engineCount}">
			<LinkTag tag="{key}" engine="{engine}" component="{component}" />
		</td>
		{/if}
		{#if grouping === "both" || grouping === "theorem"}
		{/if}
		{#if grouping === "both" || grouping === "engine"}
		<td class="grouped">
			<a href="/">
				<EngineData engine="{data.engine}" tag="{tag}" />
			</a>
		</td>
		{/if}
		<td>
			<EstimateMagnitudeGraph data="{data.mis_estimates?.scan ?? null}"></EstimateMagnitudeGraph>
			<RowData value="{data.scan}"></RowData>
		</td>
		<td>
			<EstimateMagnitudeGraph data="{data.mis_estimates?.join ?? null}"></EstimateMagnitudeGraph>
			<RowData value="{data.join}"></RowData>
		</td>
		<td>
			<EstimateMagnitudeGraph data="{data.mis_estimates?.sort ?? null}"></EstimateMagnitudeGraph>
			<RowData value="{data.sort}"></RowData>
		</td>
		<td>
			<EstimateMagnitudeGraph data="{data.mis_estimates?.hash ?? null}"></EstimateMagnitudeGraph><RowData value="{data.hash}"></RowData>
		</td>
		<td>
			<EstimateMagnitudeGraph data="{data.mis_estimates?.aggregate ?? null}"></EstimateMagnitudeGraph><RowData value="{data.aggregate}"></RowData>
		</td>
		<td>
			<EstimateMagnitudeGraph data="{data.mis_estimates?.aggregate ?? null}"></EstimateMagnitudeGraph><RowData value="{data.aggregate}"></RowData>
		</td>

	</tr>
	{/each}
	</tbody>
</table>