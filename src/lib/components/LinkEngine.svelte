<script lang="ts">
	import type { Engine, Component } from '$lib/arena-types.js';
	export let engine: Engine ;
	export let component: Component;

</script>
<a href="/engines/{engine.slug}/components/{component.slug}">{engine.engine}</a>
