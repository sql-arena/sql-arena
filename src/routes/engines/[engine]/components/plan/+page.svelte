<script lang="ts">
	import { TheoremPlanStats, LinkComponent, LinkEngine } from '$lib/components';
	import type { Engine, Component, Tag } from '$lib/arena-types.js';

	export let data: {
		proofSummaryData: Array<{ tag: Tag, proof: string, string, value: string, unit: string }>,
		component: Component,
		engine: Engine
	};
</script>

<h1>
	<LinkComponent component="{data.component}" />
	&mdash;
	<LinkEngine component="{data.component}" engine="{data.engine}" />
</h1>
<article>
	<p>Click on the workload for a detailed breakdown.</p>
</article>
<TheoremPlanStats data="{data.proofSummaryData}" engine="{data.engine}" component="{data.component}" />

