<script lang="ts">

	export let data: {
		blog: string,
		url: string,
		meta: {
			title: string,
			description: string
		}
	};
</script>

<h1>{data.meta.title}</h1>
<article>
	{@html data.blog}
</article>