<script lang="ts">
	import type { Engine } from '$lib/arena-types.js';

	export let data: Array<{ tier: string; engine: Engine; score: number }> = {};

	import EngineTier from '$lib/components/EngineTier.svelte';
	const tiers = ['S', 'A', 'B', 'C', 'D', 'F'];

	// Put items into arrays per tier
	$: itemsByTier = data.reduce((acc, item) => {
		if (!acc[item.tier]) {
			acc[item.tier] = [];
		}
		acc[item.tier].push(item);
		return acc;
	}, {} );
</script>

<table class="tier-list">
	<tbody>
	{#each tiers as tier (tier)}
	<tr class="tier-row">
		<th class="tier-label tier-{tier}">{tier}</th>
		<td class="tier-data">
			<div class="tier-items">
				{#each itemsByTier[tier] as item (item.engine)}
				<EngineTier engine="{item.engine}"/>
				{/each}
			</div>
		</td>
	</tr>
	{/each}
	</tbody>
</table>
