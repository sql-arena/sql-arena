<script lang="ts">
	import ListComponent from "$lib/components/ListComponent.svelte";
	export let data: {
		components: { component: string; description: string }[];
	};

</script>
<h1>Components</h1>

<p>Pick a component to explore.</p>
<ListComponent components="{data.components}"/>
