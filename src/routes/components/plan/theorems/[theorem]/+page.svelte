<script lang="ts">
	import { TheoremPlans,TheoremPlanStats, LinkTag, LinkComponent, MarkdownSnippet} from '$lib/components';
	import type { Component, Tag, Theorem } from '$lib/arena-types.js';


	export let data: {
		theorem: Theorem,
		description: string,
		proofData: Array<{name: string, value: string, unit: string}>,
		planData: Array<{engine: string, version: string, plan: string}>
		commentary: string
		tags: Tag[]
		component: Component
	};

</script>
<h1>
	<LinkComponent component="{data.component}"/> &mdash;
		{#each data.tags as { tag }, i (tag)}
		<LinkTag tag="{tag}" component="{data.component}"/>{i < data.tags.length - 1 ? ', ' : ''}
		{/each} &mdash; {data.theorem.theorem}</h1>

<h2>Engine Compare</h2>
<TheoremPlanStats data="{data.proofData}" component="{data.component}"/>

<h2>Actual Query Plans</h2>
<TheoremPlans data="{data.planData}" />

<MarkdownSnippet data="{data.commentary}" header="Commentary" />
