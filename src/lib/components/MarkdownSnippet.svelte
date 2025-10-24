<script lang="ts">
import { marked } from "marked";
export let data: string;
export let header: string = "";

let html: string = "";
if (data) {
	html = marked.parse(data);
}
</script>




{#if html}
{#if header}
<h2>{header}</h2>
{/if}

<!-- eslint-disable-next-line svelte/no-at-html-tags -->
<article>{@html html}</article>
{/if}
