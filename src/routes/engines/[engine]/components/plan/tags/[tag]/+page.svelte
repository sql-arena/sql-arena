<script lang="ts">
import {
	LinkComponent,
	LinkEngine,
	LinkTag,
	TheoremPlanStats
} from "$lib/components";
import type { Engine, Component, Tag } from '$lib/arena-types.js';

	export let data: {
	proofData: Array<{proof: string, value: string, unit: string, engine?: Engine, storage_variant?: string, rank: number}>,
	proofSummaryData: Array<{engine: Engine, storage_variant: string, proof: string, value: string, unit: string, rank: number}>,
	tag: Tag,
	engine: Engine,
	component: Component
};
</script>

<h1><LinkComponent component="{data.component}"/>
	&mdash; <LinkEngine component="{data.component}" engine="{data.engine}" />
	&mdash; {data.tag.tag}</h1>
<br>

<h2>Summary &mdash; Comparing other engines</h2>

<TheoremPlanStats data="{data.proofSummaryData}"
									component="{data.component}"
									tag="{data.tag}"
									highlightEngine="{data.engine}"
/>


<p><LinkTag tag="{data.tag}"  component="{data.component}" /> &mdash; Full compare</p>


<h2>Breakdown &mdash; <LinkTag tag="{data.tag}"  component="{data.component}" /> &mdash; {data.engine.engine}</h2>

<TheoremPlanStats data="{data.proofData}" component="{data.component}"/>
