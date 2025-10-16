<script lang="ts">
	export let engine: string = "";
	export let version: string = "";
	if (version.length > 0) {
		version = " " + version;
	}
</script>
<img alt="{engine} logo" class="table-logo" src="/img/logo-dark/{engine}.png"/>{engine}
