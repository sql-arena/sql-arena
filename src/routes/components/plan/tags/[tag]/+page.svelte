<script lang="ts">
	import TheoremPlanStats from '$lib/components/TheoremPlanStats.svelte';
	export let data : {
		proofData: Array<{name: string, value: string, unit: string}>
		tag: string
	};
</script>

<h1>Theorem Tag: {data.tag}</h1>

<p>Click on the individual engines for detailed drilldown</p>

<TheoremPlanStats data="{data.proofData}" is_summary="true" tag="{data.tag}" />