<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.png';
	import sprite from '$lib/assets/rank-icons.svg?raw';
	import "highlight.js/styles/github-dark.css";
	const { data, children } = $props();
	const base = "https://sql-arena.com";
	const title = data.meta?.title ?? "SQL Arena";
	const desc = data.meta?.description ?? "Deep dives into query optimizers and database internals.";
	const url = `${base}${data?.url?.pathname ?? ""}`;
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<!-- Open Graph -->
	<meta property="og:type" content="article" />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={desc} />
	<meta property="og:image" content="https://sql-arena.com/img/arena-avatar.png" />
	<meta property="og:url" content={url} />

	<!-- Twitter -->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={title} />
	<meta name="twitter:description" content={desc} />
	<meta name="twitter:image" content="https://sql-arena.com/img/arena-avatar.png" />

	<title>{title}</title>
	<meta name="description" content={desc} />
</svelte:head>

<div style="display:none">
{@html sprite}
</div>

{@render children?.()}
