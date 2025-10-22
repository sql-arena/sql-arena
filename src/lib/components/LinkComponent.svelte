<script lang="ts">
	import type { Component } from '$lib/arena-types.js';

	export let component: Component;
</script>
<a href="/components/{component.slug}">{component.description}</a>