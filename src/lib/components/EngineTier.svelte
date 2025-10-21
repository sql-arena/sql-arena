<script lang="ts">
	import ImgEngine from '$lib/components/ImgEngine.svelte';
	export let engine: string = "";
</script>
<div class="tier-item">
	<ImgEngine engine="{engine}"/>
	<span>{engine}</span>
</div>