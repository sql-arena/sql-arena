<script lang="ts">
	export let data: {
		components: { component: string; description: string }[];
	};

</script>

<h1>Components</h1>

<p>SQL Arena theorems are grouped by the component of the database it tests.</p>

<p>You can access all the raw data of the components here.</p>

<ul>
	{#each data.components as s (s.component)}
	<li><a href={`/components/${s.component}`}>{s.description}</a></li>
	{/each}
</ul>