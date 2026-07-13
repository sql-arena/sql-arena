<script lang="ts">
	import type { MisEstimate } from '$lib/arena-types.js';
	import { DataText } from '$lib/components/';
	import { SvelteMap } from 'svelte/reactivity';

	export let data: MisEstimate[] = [];

	const map_magnitude = new SvelteMap<string, { css_class: string, ordering: number }>(
		[['>16x', { css_class: 'gradient-scale-4-background', ordering: 4 }]
			, ['+8x', { css_class: 'gradient-scale-3-background', ordering: 3 }]
			, ['+4x', { css_class: 'gradient-scale-2-background', ordering: 2 }]
			, ['+2x', { css_class: 'gradient-scale-1-background', ordering: 1 }]
			, ['=', { css_class: 'gradient-scale-0-background', ordering: 0 }]
			, ['-2x', { css_class: 'gradient-scale--1-background', ordering: -1 }]
			, ['-4x', { css_class: 'gradient-scale--2-background', ordering: -2 }]
			, ['-8x', { css_class: 'gradient-scale--3-background', ordering: -3 }]
			, ['<16x', { css_class: 'gradient-scale--4-background', ordering: -4 }]]
	);

	const render_data = (data || []).map(d => {
		const m = map_magnitude.get(d.magnitude);
		if (!m) {
			throw new Error(`Unknown magnitude: ${d.magnitude}`);
		}
		return {
			magnitude: d.magnitude,
			count: d.count,
			css_class: m.css_class,
			ordering: m.ordering
		};
	}).sort((a, b) => a.ordering - b.ordering );


	const sumCount = (data?.reduce((s, d) => s + d.count, 0)) ?? 0;
</script>
<span class="sub-data"><DataText bigValue="Estimation Error"/></span>
<div class="bar-heat">
{#if sumCount === 0}
	<span class="temp no-data" style="min-width: 100%" title="No Nodes"></span>
{:else}

	{#each render_data as { magnitude, count, css_class }(magnitude) }
	<span class="temp {css_class}" style="min-width: {Math.round(100 * count / sumCount)}%" title="{magnitude} {count} operators"></span>
	{/each}
{/if}
</div>
