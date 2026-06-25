<script lang="ts">
	import { TheoremPlanStats, LinkComponent, LinkEngine } from '$lib/components';
	import type { Engine, Component, Tag } from '$lib/arena-types.js';

	export let data: {
		proofSummaryData: Array<{ tag: Tag, proof: string, value: string, unit: string, rank: number }>,
		component: Component,
		engine: Engine
	};
</script>

<h1>
	<LinkComponent component="{data.component}" /> &mdash; {data.engine.engine}
</h1>

<h2>Workload Summary</h2>

<TheoremPlanStats data="{data.proofSummaryData}" engine="{data.engine}" component="{data.component}" />

