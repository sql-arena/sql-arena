<script lang="ts">
	export let engine: string = "";
	export let version: string = "";
	export let tag: string = "";
	if (version.length > 0) {
		version = " " + version;
	}
</script>
{#if tag.length > 0}
<a href="/engines/{engine}/tags/{tag}/">
	<img alt="{engine} logo" class="table-logo" src="/img/logo-dark/{engine}.png"/>{engine}
</a>
{:else}
<img alt="{engine} logo" class="table-logo" src="/img/logo-dark/{engine}.png"/>{engine}
{/if}
