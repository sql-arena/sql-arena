<script lang="ts">
	export let data: {
		blogs: { title: string, slug: string; publish_date }[];
	};

</script>

<h1>Blog</h1>
<p>Various musing related to the SQL Arena (in table form, because that's how we roll around here).</p>

<table class="data">
	<thead>
		<tr>
			<th class="grouped">Publish Date</th>
			<th class="text">Blog</th>
		</tr>
	</thead>
	<tbody>
	{#each data.blogs as {title, slug, publish_date} (slug)}
	<tr>
		<td>{publish_date}</td>
		<td class="text"><a href="/blog/{slug}">{title}</a></td>
	</tr>
	{/each}
	</tbody>
</table>
