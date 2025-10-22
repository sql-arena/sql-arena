<script lang="ts">
	import LinkComponent from "$lib/components/LinkComponent.svelte";
	import type { Component } from '$lib/arena-types.js';
	export let components: Component[];
</script>
<ul class="big-selector">
	{#each components as c (c.component)}
	<li><LinkComponent component="{c}"/></li>
	{/each}
</ul>