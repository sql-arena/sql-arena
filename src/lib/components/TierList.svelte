<script lang="ts">
	export let data: Array<{ tier: string; engine: string; score: number }> = {};

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
				<div class="tier-item">
					<img src="/img/logo-dark/{item.engine}.png" alt="{item.engine}" class="tier-icon" />
				</div>
				{/each}
			</div>
		</td>
	</tr>
	{/each}
	</tbody>
</table>
