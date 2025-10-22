<script lang="ts">
import {
	LinkComponent,
	LinkEngine,
	LinkTag,
	TheoremPlanStats
} from "$lib/components";
import { Engine, Component, Tag } from '$lib/arena-types.js';

	export let data: {
	proofData: Array<{name: string, value: string, unit: string}>,
	tag: Tag,
	engine: Engine,
	version?: string
	component: Component
};
</script>

<h1><LinkComponent component="{data.component}"/>
	&mdash; <LinkEngine component="{data.component}" engine="{data.engine}" />
	&mdash; <LinkTag tag="{data.tag}" component="{data.component}"/></h1>
<br>

<TheoremPlanStats data="{data.proofData}" component="{data.component}"/>
