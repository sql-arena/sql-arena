<script lang="ts">
	import { EngineTierGrid, DataText, DataRank, DataRow } from '$lib/components';
	import { ESTIMATE_CATEGORIES } from '$lib/render-maps.js';
	import type { Engine, Component } from '$lib/arena-types.js';

	export type PlanRankCell = { engine: Engine; value?: number };
	export type PlanRankRow = { [op: string]: PlanRankCell[] };

	export let rows: PlanRankRow[];
	export let component: Component;
	export let showRowValues: boolean = false;

	const headers: Record<string, string> = {
		scan: 'Scan',
		seek: 'Seek',
		join: 'Join Probe',
		sort: 'Sort',
		hash: 'Hash Build',
		aggregate: 'Aggregate',
		distribution: 'Distribute'
	};
</script>

<table class="data">
	<thead>
		<tr>
			<th>Rank</th>
			{#each ESTIMATE_CATEGORIES as op}
				<th class="sticky"><DataText bigValue={headers[op]} /></th>
			{/each}
		</tr>
	</thead>
	<tbody>
		{#each rows as row, index}
			<tr>
				<td class="engine-cell">
					<div class="data-icon">
						<div class="rank-number">{index + 1}</div>
					</div>
					<div class="data-value">
						<DataRank rank={index + 1} />
					</div>
				</td>
				{#each ESTIMATE_CATEGORIES as op}
					{@const cells = [...(row[op] ?? [])].sort((a, b) =>
						a.engine.engine.localeCompare(b.engine.engine)
					)}
					<td class="engine-cell">
						<EngineTierGrid
							engines={cells.map((c) => c.engine)}
							hrefFn={(e) => `/engines/${e.slug}/components/${component.slug}/`}
						/>
						{#if showRowValues && cells[0]?.value !== undefined}
							<div class="data-value">
								<DataRow value={cells[0].value} />
							</div>
						{/if}
					</td>
				{/each}
			</tr>
		{/each}
	</tbody>
</table>

<style>
	td.engine-cell {
		text-align: center;
	}
	.rank-number {
		font-size: 80cqh;
		font-weight: bold;
	}
</style>
