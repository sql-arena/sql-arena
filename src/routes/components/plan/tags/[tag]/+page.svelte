<script lang="ts">
	import { TheoremPlanStats, LinkComponent } from '$lib/components';
	import type { Tag, Component, Engine, Theorem } from '$lib/arena-types.js';
	export let data : {
		proofSummaryData: Array<{engine: Engine, version, proof: string, string, value: string, unit: string}>
		proofData: Array<{theorem: Theorem, engine: Engine, version: string, proof: string, value: string, unit: string}>
		tag: Tag,
		component: Component
	};
</script>

<h1><LinkComponent component="{data.component}"/> &mdash; {data.tag.tag}</h1>

<p>Click on the individual engines for detailed drilldown</p>

<h2>Summary</h2>

<TheoremPlanStats data="{data.proofSummaryData}" tag="{data.tag}" component="{data.component}"/>

<h2>Breakdown</h2>

<TheoremPlanStats data="{data.proofData}" tag="{data.tag}" component="{data.component}"/>

