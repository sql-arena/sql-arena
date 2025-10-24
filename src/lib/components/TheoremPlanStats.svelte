<script lang="ts">
	import { ESTIMATE_CATEGORIES } from '$lib/render-maps.js';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import type { Engine, MisEstimate, Tag, Component } from '$lib/arena-types.js';
	import { DataEngine, DataText, LinkTheorem, LinkTag, EstimateMagnitudeGraph, DataRow } from '$lib/components';

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
	export let highlightEngine: Engine;

	if (!component) {
		throw new Error('component is required for theoremPlanStats');
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
	<caption>Accuracy chart, rows processed <a class="help" href="/legend/estimation">?</a></caption>
	<thead>
	<tr>
		{#if grouping === "theorem"}
		<th class="grouped"></th>
		{/if}
		{#if grouping === "engine" || grouping === "both"}
		<th class="grouped"></th>
		{/if}
		{#if grouping === "tag" }
		<th class="grouped"></th>
		{/if}
		<th class="sticky"><DataText bigValue="Scan"/></th>
		<th class="sticky"><DataText bigValue="Join Probe" smallValue="Join"/></th>
		<th class="sticky"><DataText bigValue="Sort"/></th>
		<th class="sticky"><DataText bigValue="Hash Build" smallValue="Hash"/></th>
		<th class="sticky"><DataText bigValue="Aggregate" smallValue="Agg"/></th>
		<th class="sticky"><DataText bigValue="Distribute" smallValue="Dist"/></th>
	</tr>
	</thead>
	<tbody>
	{#each sortedEngineRow as [key, data], index}

	{#if grouping === "both" && (index === 0 || sortedEngineRow[index - 1][1].theorem !== data.theorem)}
	<tr>
		<th class="header-divider" colspan="7">
				<LinkTheorem theorem="{data.theorem}" component="{component}" />
		</th>
	</tr>
	{/if}

	<tr>
		<td class="grouped">
		{#if grouping === "tag"}
			<LinkTag tag="{key}" engine="{engine}" component="{component}" />
		{:else if grouping === "engine" || grouping === "both"}
			{#if highlightEngine && highlightEngine.slug != data.engine.slug}
			<a href="/engines/{data.engine.slug}/components/{component.slug}/tags/{tag.slug}">
				<DataEngine engine="{data.engine}" tag="{tag}" />
			</a>
			{:else}
			<DataEngine engine="{data.engine}" tag="{tag}" />
			{/if}
		{:else}
			<LinkTheorem theorem="{data.theorem}" component="{component}" />
		{/if}
		</td>
		<td>
			<EstimateMagnitudeGraph data="{data.mis_estimates?.scan ?? null}"/>
			<DataRow value="{data.scan}"/>
		</td>
		<td>
			<EstimateMagnitudeGraph data="{data.mis_estimates?.join ?? null}"/>
			<DataRow value="{data.join}"/>
		</td>
		<td>
			<EstimateMagnitudeGraph data="{data.mis_estimates?.sort ?? null}"/>
			<DataRow value="{data.sort}"/>
		</td>
		<td>
			<EstimateMagnitudeGraph data="{data.mis_estimates?.hash ?? null}"/>
			<DataRow value="{data.hash}"/>
		</td>
		<td>
			<EstimateMagnitudeGraph data="{data.mis_estimates?.aggregate ?? null}"/>
			<DataRow value="{data.aggregate}"/>
		</td>
		<td>
			<EstimateMagnitudeGraph data="{data.mis_estimates?.distribution ?? null}"/>
			<DataRow value="0"/>
		</td>

	</tr>
	{/each}
	</tbody>
</table>