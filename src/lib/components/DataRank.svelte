<script lang="ts">
export let rank: number = 0;
import { MAX_RANK } from '$lib/arena-types';
</script>

{#if rank > 0 && rank <= MAX_RANK}
{#each Array.from({ length: MAX_RANK - rank + 1 }) as _, i}
<svg class="rank rank{rank}" role="img"><use href="#tron-star"/></svg>
{/each}
{:else}
<svg class="rank rankNone" role="img"></svg>
{/if}
