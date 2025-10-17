<script lang="ts">
import EngineData from "$lib/components/EngineData.svelte";
import TheoremPlanStats from "$lib/components/TheoremPlanStats.svelte";
	export let data: {
	proofData: Array<{name: string, value: string, unit: string}>,
	tag: string,
	engine: string,
	version?: string
};
</script>

<h1>Engine Specific Drilldown&nbsp;-&nbsp;{data.tag}</h1>
<br>
<EngineData engine="{data.engine}"></EngineData>

<TheoremPlanStats data="{data.proofData}"/>
