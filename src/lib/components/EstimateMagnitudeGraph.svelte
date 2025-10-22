<script lang="ts">
	import type { MisEstimate } from '$lib/arena-types.js';
	import { SvelteMap } from 'svelte/reactivity';

	export let data: MisEstimate[] = [];

	const map_magnitude = new SvelteMap<string, { css_class: string, ordering: number }>(
		[['>16x', { css_class: 'gradient-scale-4-background', ordering: 4 }]
			, ['+8x', { css_class: 'gradient-scale-3-background', ordering: 3 }]
			, ['+4x', { css_class: 'gradient-scale-2-background', ordering: 2 }]
			, ['+2x', { css_class: 'gradient-scale-1-background', ordering: 1 }]
			, ['=', { css_class: 'gradient-scale-0-background', ordering: 0 }]
			, ['-2x', { css_class: 'gradient-scale-1-background', ordering: -1 }]
			, ['-4x', { css_class: 'gradient-scale-2-background', ordering: -2 }]
			, ['-8x', { css_class: 'gradient-scale-3-background', ordering: -3 }]
			, ['<16x', { css_class: 'gradient-scale-4-background', ordering: -4 }]]
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


	const maxCount = Math.max(...(data?.map(d => d.count) || []), 0);
</script>

<div class="bar-chart">
	{#each render_data as { magnitude, count, css_class }(magnitude) }
	<div class="bar {css_class}" style="height: {100 * count / maxCount}%" title="{magnitude} {count} operators"></div>
	{/each}
</div>