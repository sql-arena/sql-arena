<script lang="ts">
	import ImgEngine from '$lib/components/ImgEngine.svelte';
	import StorageVariantIcon from '$lib/components/StorageVariantIcon.svelte';
	import type { Engine } from '$lib/arena-types.js';
	export let engine: Engine;
	export let showLabel: boolean = false;
</script>

{#if showLabel}
<div class="engine-container">
	<div class="engine-img-wrap">
		<ImgEngine {engine} />
		<StorageVariantIcon storage_variant={engine.storage_variant} />
	</div>
	<div class="engine-text big-value">{engine.engine}</div>
</div>
{:else}
<div class="tier-item">
	<div class="engine-img-wrap">
		<ImgEngine {engine} />
		<StorageVariantIcon storage_variant={engine.storage_variant} />
	</div>
</div>
{/if}
