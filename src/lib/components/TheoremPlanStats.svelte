<script lang="ts">
	import { ESTIMATE_CATEGORIES, operation_map } from '$lib/render-maps.js';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import type { Engine, MisEstimate, Tag, Theorem, Component } from '$lib/arena-types.js';
	import { EngineTier, DataText, DataRank, LinkTheorem, LinkTag, EstimateMagnitudeGraph, DataRow } from '$lib/components';

	export let data:
		Array<{
			proof: string,
			unit: string,
			value: string,
			/* We can either group by engine or by theorem (or both), depending on the context. */
			engine?: Engine,
			version?: string,
			theorem?: Theorem,
			tag?: Tag
			rank: number
		}>;
	export let tag: Tag | undefined = undefined;
	export let engine: Engine | undefined = undefined;
	export let component: Component;
	export let highlightEngine: Engine | undefined = undefined;

	if (!component) {
		throw new Error('component is required for theoremPlanStats');
	}

	type RowEntry = {
		theorem?: Theorem,
		engine?: Engine,
		tag?: Tag,
		grouping: string,
		seek?: number,
		join?: number,
		aggregate?: number,
		sort?: number,
		hash?: number,
		scan?: number,
		distribution?: number,
		ranks?: {
			join?: number,
			seek?: number,
			scan?: number,
			sort?: number,
			hash?: number,
			aggregate?: number,
			distribution?: number
		},
		mis_estimates?: {
			join: MisEstimate[],
			seek: MisEstimate[],
			scan: MisEstimate[],
			sort: MisEstimate[],
			hash: MisEstimate[],
			aggregate: MisEstimate[],
			distribution: MisEstimate[]
		},
		[key: string]: unknown
	};
	let rowData = new SvelteMap<string, RowEntry>();

	let distinctEngines = new SvelteSet<string>();
	let grouping: string = 'unknown';
	let key: string = '';
	for (let entry of data) {

		if (entry.tag) {
			grouping = 'tag';
			key = entry.tag.slug;
		}
		if (entry.engine && entry.theorem) {
			grouping = 'both';
			key = entry.theorem.slug + ':' + entry.engine.slug + ':' + entry.engine.storage_variant;
		} else if (entry.engine) {
			grouping = 'engine';
			key = entry.engine.slug + ':' + entry.engine.storage_variant;
		} else if (entry.theorem) {
			grouping = 'theorem';
			key = entry.theorem.slug;
		}
		if (!rowData.has(key)) {
			rowData.set(key, { grouping });
		}

		let values = rowData.get(key)!;
		values.grouping = grouping;
		values.engine = entry.engine;
		values.theorem = entry.theorem;
		if (entry.tag) {
			values.tag = entry.tag;
		}
		if (entry.engine) {
			distinctEngines.add(entry.engine.slug + ':' + entry.engine.storage_variant);
		}
		const proofLower = operation_map.get(entry.proof) ?? entry.proof.toLowerCase();

		if (entry.unit === "Rows") {
			/* Extract the rankings */
			if (!values.ranks) {
				values.ranks = { seek: 0, distribution: 0 };
			}
			(values.ranks as Record<string, number>)[proofLower] = Number(entry.rank);
		}

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
					ESTIMATE_CATEGORIES.map(cat => [cat, [] as MisEstimate[]])
				) as RowEntry['mis_estimates'];
			}
			const op = (operation_map.get(parts[1]) ?? parts[1].toLowerCase()) as keyof NonNullable<RowEntry['mis_estimates']>;
			values.mis_estimates![op]?.push({ magnitude: m, count: c });
		}
	}

	let sortedEngineRow = (Array.from(rowData.entries())).sort((a, b) => {
		return a[0].localeCompare(b[0]);
	});


</script>

<table class="data">
	<caption>Accuracy chart, rows processed <a class="help" href="/legend/estimation">?</a></caption>
	{#if grouping !== "both"}
	<thead>
	<tr>
		{#if grouping === "theorem"}
		<th class="grouped"></th>
		{/if}
		{#if grouping === "engine"}
		<th class="grouped"></th>
		{/if}
		{#if grouping === "tag"}
		<th class="grouped"></th>
		{/if}
		<th class="sticky"><DataText bigValue="Scan"/></th>
		<th class="sticky"><DataText bigValue="Seek"/></th>
		<th class="sticky"><DataText bigValue="Join Probe"/></th>
		<th class="sticky"><DataText bigValue="Sort"/></th>
		<th class="sticky"><DataText bigValue="Hash Build"/></th>
		<th class="sticky"><DataText bigValue="Aggregate"/></th>
		<th class="sticky"><DataText bigValue="Distribute"/></th>
	</tr>
	</thead>
	{/if}
	<tbody>
	{#each sortedEngineRow as [_key, data], index}

	{#if grouping === "both" && (index === 0 || sortedEngineRow[index - 1][1].theorem !== data.theorem)}
	<tr>
		<th class="header-divider" colspan="8" id="theorem-{data.theorem!.slug}">
				<LinkTheorem theorem="{data.theorem!}" component="{component}" />
		</th>
	</tr>
	<tr class="sub-header">
		<th></th>
		<th><DataText bigValue="Scan"/></th>
		<th><DataText bigValue="Seek"/></th>
		<th><DataText bigValue="Join Probe"/></th>
		<th><DataText bigValue="Sort"/></th>
		<th><DataText bigValue="Hash Build"/></th>
		<th><DataText bigValue="Aggregate"/></th>
		<th><DataText bigValue="Distribute"/></th>
	</tr>
	{/if}

	<tr>
		<td class="grouped">
		{#if grouping === "tag"}
			<LinkTag tag="{data.tag!}" engine="{engine}" component="{component}" />
		{:else if grouping === "engine" || grouping === "both"}
			{#if highlightEngine && highlightEngine.slug != data.engine!.slug}
			<a href="/engines/{data.engine!.slug}/components/{component.slug}/tags/{tag?.slug}">
				<EngineTier engine="{data.engine!}" />
			</a>
			{:else}
			<EngineTier engine="{data.engine!}" />
			{/if}
		{:else}
			<LinkTheorem theorem="{data.theorem!}" component="{component}" />
		{/if}
		</td>
		<td>
			<EstimateMagnitudeGraph data="{data.mis_estimates?.scan ?? []}"/>
			<DataRow value="{data.scan}"/>
			<div class="sub-data">Rank</div>
			<DataRank rank="{data.ranks?.scan ?? 0}"></DataRank>
		</td>
		<td>
			{#if data.seek !== undefined}
				<EstimateMagnitudeGraph data="{data.mis_estimates?.seek ?? []}"/>
				<DataRow value="{data.seek}"/>
				<div class="sub-data">Rank</div>
				<DataRank rank="{data.ranks?.seek ?? 0}"></DataRank>
			{/if}
		</td>
		<td>
			<EstimateMagnitudeGraph data="{data.mis_estimates?.join ?? []}"/>

			<DataRow value="{data.join}"/>
			<div class="sub-data">Rank</div>

			<DataRank rank="{data.ranks?.join ?? 0}"></DataRank>
		</td>
		<td>
			<EstimateMagnitudeGraph data="{data.mis_estimates?.sort ?? []}"/>
			<DataRow value="{data.sort}"/>
			<div class="sub-data">Rank</div>
			<DataRank rank="{data.ranks?.sort ?? 0}"></DataRank>
		</td>
		<td>
			<EstimateMagnitudeGraph data="{data.mis_estimates?.hash ?? []}"/>
			<DataRow value="{data.hash}"/>
			<div class="sub-data">Rank</div>
			<DataRank rank="{data.ranks?.hash ?? 0}"></DataRank>
		</td>
		<td>
			<EstimateMagnitudeGraph data="{data.mis_estimates?.aggregate ?? []}"/>
			<DataRow value="{data.aggregate}"/>
			<div class="sub-data">Rank</div>
			<DataRank rank="{data.ranks?.aggregate ?? 0}"></DataRank>
		</td>
		<td>
			<EstimateMagnitudeGraph data="{data.mis_estimates?.distribution ?? []}"/>
			<DataRow value="{data.distribution}"/>
			<div class="sub-data">Rank</div>
			<DataRank rank="{data.ranks?.distribution ?? 0}"></DataRank>
		</td>

	</tr>
	{/each}
	</tbody>
</table>
