<script lang="ts">
	import ImgEngine from '$lib/components/ImgEngine.svelte';
	export let engine: string = "";
	export let version: string = "";
	export let tag: string = "";
	if (version.length > 0) {
		version = " " + version;
	}
</script>
{#if tag.length > 0}
<a href="/engines/{engine}/tags/{tag}" class="engine-container">
	<ImgEngine engine="{engine}" />{engine.engine}
</a>
{:else}
<div class="engine-container">
<ImgEngine engine="{engine}" />
<div class="engine-text big-value">{engine.engine}</div>
</div>
{/if}

