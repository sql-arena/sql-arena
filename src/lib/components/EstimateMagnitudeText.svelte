<script lang="ts">
	import type { MisEstimate } from '$lib/arena-types.js';
	import { SvelteMap } from 'svelte/reactivity';

	export let data: MisEstimate[] = [];

	const map_magnitude = new SvelteMap<string, { css_class: string, ordering: number }>(
		[ ['>16x', { css_class: 'shit-scale-4', ordering: 4 } ]
		, [ '+8x', { css_class: 'shit-scale-3', ordering: 3 } ]
		, [ '+4x', { css_class: 'shit-scale-2', ordering: 2 } ]
		, [ '+2x', { css_class: 'shit-scale-1', ordering: 1 } ]
		, [ '=', { css_class: 'shit-scale-0', ordering: 0 } ]
		, [ '-2x', { css_class: 'shit-scale-1', ordering: -1 } ]
		, [ '-4x', { css_class: 'shit-scale-2', ordering: -2 } ]
		, [ '-8x', { css_class: 'shit-scale-3', ordering: -3 } ]
		, [ '<16x', { css_class: 'shit-scale-4', ordering: -4 } ] ]
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
	}).sort((a, b) => b.ordering - a.ordering);



</script>

<table class="magnitude">
	<tbody>
		{#each render_data as { magnitude, count, css_class}(magnitude) }
			{#if count > 0}
			<tr>
				<td class={css_class}>{magnitude}</td>
				<td class={css_class}>{count ? count : ''}</td>
			</tr>
			{/if}
		{/each}
	</tbody>
</table>