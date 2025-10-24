<script lang="ts">
import type { Tag, Component } from '$lib/arena-types.js';

export let tags: Tag[];
export let component: Component;
</script>

<ul class="small-selector">
{#each tags as {tag} (tag.slug) }
		<li><a href="/components/{component.slug}/tags/{tag.slug}">{tag.tag}</a></li>
{/each}
</ul>