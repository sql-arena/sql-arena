<script lang="ts">

	export let data: {
		blog: string,
		title: string
	};

</script>
<h1>{data.title}</h1>
<article>
	{@html data.blog}
</article>