<script lang="ts">
	export let bigValue: string = "";
	export let smallValue: string = "";
	if (!smallValue) smallValue = bigValue;
</script>

<div class="big-value">{bigValue}</div><div class="small-value">{smallValue}</div>