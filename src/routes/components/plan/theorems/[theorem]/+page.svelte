<script lang="ts">
	import TheoremPlanStats from '$lib/components/TheoremPlanStats.svelte';
	import TheoremPlans from '$lib/components/TheoremPlans.svelte';
	import MarkdownSnippet from '$lib/components/MarkdownSnippet.svelte';
	export let data: {
		theorem: string,
		description: string,
		proofData: Array<{name: string, value: string, unit: string}>,
		planData: Array<{engine: string, version: string, plan: string}>
		commentary: string
	};
</script>

<h1>Planning Theorem: {data.theorem}</h1>

<MarkdownSnippet data="{data.commentary}" />

<TheoremPlanStats data="{data.proofData}" />

<TheoremPlans data="{data.planData}" />
