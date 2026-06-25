<script lang="ts">
	import { TheoremPlanStats, LinkComponent } from '$lib/components';
	import type { Tag, Component, Engine, Theorem } from '$lib/arena-types.js';
	export let data : {
		proofSummaryData: Array<{engine: Engine, storage_variant: string, proof: string, value: string, unit: string, rank: number}>
		proofData: Array<{theorem: Theorem, engine: Engine, storage_variant: string, proof: string, value: string, unit: string, rank: number}>
		tag: Tag,
		component: Component
	};
</script>

<h1><LinkComponent component="{data.component}"/> &mdash; {data.tag.tag}</h1>

<h2>Summary</h2>

<TheoremPlanStats data="{data.proofSummaryData}" tag="{data.tag}" component="{data.component}"/>

<h2>Breakdown</h2>

<TheoremPlanStats data="{data.proofData}" tag="{data.tag}" component="{data.component}"/>

