<script lang="ts">
	export let theorem: string;
	export let component: string;
</script>
<a href="/components/{component.toLowerCase()}/theorems/{theorem.toLowerCase()}">{theorem}</a>