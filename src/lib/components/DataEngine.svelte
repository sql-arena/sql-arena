<script lang="ts">
	import type { Engine } from '$lib/arena-types.js';
	import ImgEngine from '$lib/components/ImgEngine.svelte';
	export let engine: Engine;
</script>

<div class="engine-container">
	<ImgEngine {engine} />
	<div class="engine-text big-value">{engine.engine}</div>
	<div class="engine-variant">
		{#if engine.storage_variant === 'iceberg'}
			<img src="/img/iceberg.webp" alt="Apache Iceberg" class="variant-icon" />
		{:else}
			{engine.storage_variant}
		{/if}
	</div>
</div>
