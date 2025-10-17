<script lang="ts">
	export let data: {
		components: { component: string; description: string }[];
	};

</script>
<h1>Components</h1>

<p>SQL Arena theorems are grouped by the component of the database it tests.</p>

<ul class="big-selector">
	{#each data.components as s (s.component)}
	<LinkComponent component="{s.component}" title="{s.description}"/>
	{/each}
</ul>
