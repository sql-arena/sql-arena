<script lang="ts">
	const SHORT: Record<string, string> = {
		'Join Probe': 'Join',
		'Hash Build': 'Hash',
		'Aggregate': 'Agg',
		'Distribute': 'Dist',
		'Estimation Error': 'Est Err',
		'Row Operations': 'Ops',
	};

	export let bigValue: string = "";
	export let smallValue: string = "";
	if (!smallValue) smallValue = SHORT[bigValue] ?? bigValue;
</script>

<div class="big-value">{bigValue}</div><div class="small-value">{smallValue}</div>