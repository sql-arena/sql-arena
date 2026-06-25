<script lang="ts">
	import { TheoremPlans, TheoremPlanStats, LinkTag, LinkComponent, MarkdownSnippet, DataSQL } from '$lib/components';
	import type { Component, Tag, Theorem } from '$lib/arena-types.js';


	import type { Engine } from '$lib/arena-types.js';
	export let data: {
		theorem: Theorem,
		description: string,
		proofData: Array<{proof: string, value: string, unit: string, engine?: Engine, storage_variant?: string, rank: number}>,
		planData: Array<{engine: Engine, storage_variant: string, plan: string}>
		commentary: string
		tags: Array<{tag: Tag}>
		component: Component
	};

</script>
<h1>
	<LinkComponent component="{data.component}"/> &mdash;
		{#each data.tags as { tag }, i (tag)}
		<LinkTag tag="{tag}" component="{data.component}"/>{i < data.tags.length - 1 ? ', ' : ''}
		{/each} &mdash; {data.theorem.theorem}</h1>

<DataSQL sql="{data.theorem.sql ?? ''}" />

<h2>Engine Compare</h2>
<TheoremPlanStats data="{data.proofData}" component="{data.component}"/>

<h2>Actual Query Plans</h2>
<TheoremPlans data="{data.planData}" />

<MarkdownSnippet data="{data.commentary}" header="Commentary" />
