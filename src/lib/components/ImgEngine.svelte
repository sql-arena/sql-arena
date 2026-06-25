<script lang="ts">
	import type { Engine } from '$lib/arena-types.js';
	import { getLogoDarkAsset } from '$lib/logo-dark-assets';

	export let engine: Engine;
</script>
<img alt="{engine.engine} logo" class="engine-logo" src={getLogoDarkAsset(engine.engine)} />
