<script lang="ts">
	import { Theorem, Component } from '$lib/arena-types.js';

	export let theorem: Theorem;
	export let component: Component;
</script>
<a href="/components/{component.slug}/theorems/{theorem.slug}">{theorem.theorem}</a>