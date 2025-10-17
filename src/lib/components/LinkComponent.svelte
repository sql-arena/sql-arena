<script lang="ts">
	export let component: string;
	export let title: string;
</script>
<li><a href={`/components/${component.toLowerCase()}`}>{description}</a></li>