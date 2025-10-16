<script lang="ts">
import { marked } from "marked";
export let data: string;

let html: string = "";
if (data) {
	html = marked.parse(data);
}
</script>

{#if html}
<!-- eslint-disable-next-line svelte/no-at-html-tags -->
<article>{@html html}</article>
{/if}
