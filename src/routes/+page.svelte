<script lang="ts">
	import ListComponent from '$lib/components/ListComponent.svelte';

	export let data: {
		components: { component: string; description: string }[];
	};

</script>
<div class="front-cover">
	<h1>SQL Arena</h1>
	<div class="sub-title">Where databases go to fight!</div>
</div>

<h2>Why?</h2>
<article>
	<p>SQL Arena is an independent project that aims to provide comparative data between database vendors.
		This should help you make informed decisions about which database to use for your next project and
		tell you where to expect issues.
	</p>

	<p>Data rendered on this website is collected using a tool called <code>dbprove</code>.</p>

	<p>All tooling used by SQL Arena are open source under the Apache License. People interested in databases
		are invited to contribute (see: <a href="/dbprove/">DBProve</a>).</p>

	<p>In the cases where the <a href="https://en.wikipedia.org/wiki/David_DeWitt">DeWitt Clause</a> allows it
		&mdash; performance metrics will be measured. For other cases, vendors will either be excluded or
		measurements not related to performance will be published.</p>
</article>

<h2>Components</h2>
<article>
	<p>Data is divided into components that roughly match the typical, architectural stack of a relational database.
		Explore below.</p>

</article>
<ListComponent components="{data.components}" />


<article>
	<p>This site is meant to be educational. It is a way to compare multiple databases against each
		other in as neutral and objective a way as possible.</p>

	<p>We are always looking to improve the site and our measurement. Comments, sugggestions and
		improvements are most welcome and can be directed to Thomas Kejser at my LinkedIn account
		of via email.</p>

	<p>All data rendered on this site is made with <a href="/dbprove">DBProve</a>.</p>
</article>

<h2>How can I contribute?</h2>
<article>
	<p>We are glad you asked!</p>

	<p>You can contribute results to this site or if you feel like hacking code - you can
		even files Pull Requests against DBProve</p>

	<p>More details are here: <a href="/dbprove/">Contributing</a></p>
</article>

<h2>Theorems?</h2>
<article>
	<p>Theorems are tests bundles with analysis. Typically, a query or set of queries is run
		and automated analysis is then performed on the results.</p>

	<p>The automated Analysis Includes such things as</p>

	<ul>
		<li>Runtimes broken into their components (when the engine supports it)</li>
		<li>Query Plan shapes and relational operator usage</li>
		<li>Latency Measurements</li>
		<li>CPU cycle breakdown when viable — falling back estimation when the engine is lacking instrumentation.</li>
		<li>I/O detailed analysis using whatever instrumentation is available</li>
	</ul>

</article>
