<script lang="ts">
	import '../app.css';
	import {page} from '$app/state';
	import favicon from '$lib/assets/favicon.png';
	import sprite from '$lib/assets/rank-icons.svg?raw';
	import "highlight.js/styles/github-dark.css";
	export let data;
	const meta = data?.meta;
	const url = "";
	const title = page.data.meta?.title ?? "SQL Arena";
	const desc = page.data.meta?.description ?? "Deep dives into query optimizers and database internals.";
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



<slot/>
