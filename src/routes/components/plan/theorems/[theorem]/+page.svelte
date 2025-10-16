<script lang="ts">
	import PlanTheorem from '$lib/components/PlanTheorem.svelte';
	import MarkdownSnippet from '$lib/components/MarkdownSnippet.svelte';
	export let data: {
		theorem: string,
		description: string,
		proofData: Array<{name: string, value: string, unit: string}>,
		commentary: string
	};
</script>

<h1>Planning Theorem: {data.theorem}</h1>

<MarkdownSnippet data="{data.commentary}" />

<PlanTheorem
	theorem="{data.theorem}"
	data="{data.proofData}" />
