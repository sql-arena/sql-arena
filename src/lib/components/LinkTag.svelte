<script lang="ts">
	import type { Engine, Component, Tag } from '$lib/arena-types.js';

	export let engine: Engine;
	export let component: Component;
	export let tag: Tag;
	if (!component) {
		throw new Error("Component context is required to render LinkTag");
	}
</script>
{#if (engine)}
<a href="/engines/{engine.slug}/components/{component.slug}/tags/{tag.slug}">{tag.tag}</a>
{:else}
<a href="/components/{component.slug}/tags/{tag.slug}">{tag.tag}</a>
{/if}
