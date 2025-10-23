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

<h1>Workload: {data.tag.tag}</h1>

<p>Click on the individual engines for detailed drilldown</p>

<h2>Summary</h2>

<p style="margin-top:-20px">Accuracy chart, rows processed <a class="help" href="/legend/">?</a></p>
<TheoremPlanStats data="{data.proofSummaryData}" tag="{data.tag}" component="{data.component}"/>

<h2>Breakdown</h2>
<p style="margin-top:-20px">Accuracy chart, rows processed <a class="help" href="/legend/">?</a></p>

<TheoremPlanStats data="{data.proofData}" tag="{data.tag}" component="{data.component}"/>

