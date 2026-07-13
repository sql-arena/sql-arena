<script lang="ts">
	import {
		TheoremPlanStats,
		LinkComponent,
		EngineTierGrid,
		DataText,
		PlanRankTable
	} from '$lib/components';
	import type { PlanRankRow } from '$lib/components/PlanRankTable.svelte';
	import { operation_map, ESTIMATE_CATEGORIES } from '$lib/render-maps.js';
	import type { Tag, Component, Engine, Theorem } from '$lib/arena-types.js';
	export let data: {
		proofSummaryData: Array<{
			engine: Engine;
			storage_variant: string;
			proof: string;
			value: string;
			unit: string;
			rank: number;
		}>;
		proofData: Array<{
			theorem: Theorem;
			engine: Engine;
			storage_variant: string;
			proof: string;
			value: string;
			unit: string;
			rank: number;
		}>;
		tag: Tag;
		component: Component;
	};

	type TocRow = { theorem: Theorem; best: Record<string, Engine[]> };

	const tocMap = new Map<string, TocRow>();
	for (const row of data.proofData) {
		if (!row.theorem || row.unit !== 'Rows' || Number(row.rank) !== 1) continue;
		const op = operation_map.get(row.proof) ?? row.proof.toLowerCase();
		if (!ESTIMATE_CATEGORIES.includes(op)) continue;
		const key = row.theorem.slug;
		if (!tocMap.has(key)) tocMap.set(key, { theorem: row.theorem, best: {} });
		const entry = tocMap.get(key)!;
		if (!entry.best[op]) entry.best[op] = [];
		entry.best[op].push(row.engine);
	}
	for (const entry of tocMap.values()) {
		for (const op of ESTIMATE_CATEGORIES) {
			entry.best[op]?.sort((a, b) => a.engine.localeCompare(b.engine));
		}
	}

	const toc = Array.from(tocMap.values()).sort((a, b) =>
		a.theorem.slug.localeCompare(b.theorem.slug)
	);

	const rankMap = new Map<number, PlanRankRow>();
	for (const row of data.proofSummaryData) {
		if (row.unit !== 'Rows') continue;
		const op = operation_map.get(row.proof as string) ?? (row.proof as string).toLowerCase();
		if (!ESTIMATE_CATEGORIES.includes(op)) continue;
		const rank = Number(row.rank);
		if (!rankMap.has(rank)) {
			const emptyRow: PlanRankRow = {};
			for (const cat of ESTIMATE_CATEGORIES) emptyRow[cat] = [];
			rankMap.set(rank, emptyRow);
		}
		rankMap.get(rank)![op].push({ engine: row.engine as Engine, value: Number(row.value) });
	}

	const summaryRows: PlanRankRow[] = Array.from(rankMap.entries())
		.sort((a, b) => a[0] - b[0])
		.map(([, row]) => row);
</script>

<style>
</style>

<h1><LinkComponent component={data.component} /> &mdash; {data.tag.tag}</h1>

<h2>Summary</h2>

<PlanRankTable rows={summaryRows} component={data.component} showRowValues={true} />

{#if toc.length > 0}
	<h2>Contents</h2>
	<article>
		<p>
			Each theorem below is listed with the best-performing engine per operation type. Click a
			theorem name to jump to its full breakdown.
		</p>
	</article>
	<table class="data toc">
		<thead>
			<tr>
				<th class="left">Theorem</th>
				<th><DataText bigValue="Scan" /></th>
				<th><DataText bigValue="Seek" /></th>
				<th><DataText bigValue="Join Probe" /></th>
				<th><DataText bigValue="Sort" /></th>
				<th><DataText bigValue="Hash Build" /></th>
				<th><DataText bigValue="Aggregate" /></th>
				<th><DataText bigValue="Distribute" /></th>
			</tr>
		</thead>
		<tbody>
			{#each toc as row}
				<tr>
					<td class="left"><a href="/components/plan/theorems/{row.theorem.slug}/">{row.theorem.theorem}</a></td>
					{#each ESTIMATE_CATEGORIES as op}
						{@const engines = row.best[op] ?? []}
						<td>
							<EngineTierGrid
								{engines}
								hrefFn={e => `/engines/${e.slug}/components/${data.component.slug}/`}
							/>
						</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
{/if}
