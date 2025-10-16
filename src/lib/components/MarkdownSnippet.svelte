<script lang="ts">
import { marked } from "marked";
export let data: string;

let html: string = "";
if (data) {
	html = marked.parse(data);
}
</script>

<article>{@html html}</article>