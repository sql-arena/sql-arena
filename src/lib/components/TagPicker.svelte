<script lang="ts">
export let data: Array<{ tag: string}> = [];
export let component: string = "";
</script>

<ul class="small-selector">
{#each data as {tag}}
	<li><a href="/components/{component.toLowerCase()}/tags/{tag.toLowerCase()}">{tag}</a></li>
{/each}
</ul>