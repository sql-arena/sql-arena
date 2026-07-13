<script lang="ts">
	import EngineTier from './EngineTier.svelte';
	import type { Engine } from '$lib/arena-types.js';

	export let engines: Engine[];
	export let hrefFn: (engine: Engine) => string;

	$: cols = Math.max(1, Math.ceil(Math.sqrt(engines.length)));
</script>

<style>
	.engine-tier-grid {
		display: grid;
	}
	.engine-tier-grid :global(.engine-img-wrap) {
		display: block;
		width: 100%;
	}
	.engine-tier-grid :global(.engine-logo) {
		width: 100%;
		max-width: 100%;
	}
	a {
		display: block;
	}
</style>

{#if engines.length > 0}
<div class="engine-tier-grid data-icon" style="grid-template-columns: repeat({cols}, 1fr)">
	{#each engines as engine}
		<a href={hrefFn(engine)}>
			<EngineTier {engine} />
		</a>
	{/each}
</div>
{/if}
