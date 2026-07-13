<script lang="ts">
	export let storage_variant: string | undefined | null;
</script>
{#if storage_variant === 'iceberg'}
	<img src="/img/iceberg.webp" alt="Apache Iceberg" title="Apache Iceberg" class="variant-icon" />
{:else if storage_variant === 'native' || !storage_variant}
	<img src="/img/native.svg" alt="Native storage" title="Native storage" class="variant-icon" />
{:else}
	<span class="variant-icon">{storage_variant}</span>
{/if}
