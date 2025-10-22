<script lang="ts">
	import ImgEngine from '$lib/components/ImgEngine.svelte';
	import type { Engine } from '$lib/arena-types.js';
	export let engine: Engine;
</script>
<div class="tier-item">
	<ImgEngine engine="{engine}"/>
	<span>{engine.engine}</span>
</div>