<script lang="ts">
	import { TheoremPlanStats } from '$lib/components';
	import type { Tag, Component, Engine } from '$lib/arena-types.js';
	export let data : {
		proofSummaryData: Array<{engine: Engine, version, proof: string, string, value: string, unit: string}>
		proofData: Array<{theorem: string, engine: Engine, version: string, proof: string, value: string, unit: string}>
		tag: Tag,
		component: Component
	};
</script>

<h1>Workload: {data.tag.tag} - Summary</h1>

<p>Click on the individual engines for detailed drilldown</p>


<TheoremPlanStats data="{data.proofSummaryData}" tag="{data.tag}" component="{data.component}"/>

<h2>{data.tag.tag} Breakdown</h2>

<TheoremPlanStats data="{data.proofData}" tag="{data.tag}" component="{data.component}"/>

