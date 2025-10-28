<script lang="ts">
export let data: string;
export let header: string = "";
</script>



{#if data}
{#if header}
<h2>{header}</h2>
{/if}

<!-- eslint-disable-next-line svelte/no-at-html-tags -->
<article>{@html data}</article>
{/if}
