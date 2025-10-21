<script lang="ts">
	import TheoremPlanStats from '$lib/components/TheoremPlanStats.svelte';
	export let data : {
		proofSummaryData: Array<{engine: string, version, proof: string, string, value: string, unit: string}>
		proofData: Array<{theorem: string, engine: string, version: string, proof: string, value: string, unit: string}>
		tag: string
	};
</script>

<h1>Theorem Tag: {data.tag}</h1>

<p>Click on the individual engines for detailed drilldown</p>

<h2>Theorem Tag: {data.tag} &mdash; Summary</h2>

<TheoremPlanStats data="{data.proofSummaryData}" tag="{data.tag}" />

<h2>Theorem Breakdown</h2>

<TheoremPlanStats data="{data.proofData}" tag="{data.tag}" />

