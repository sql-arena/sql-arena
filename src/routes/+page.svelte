<script lang="ts">
	import ListComponent from '$lib/components/ListComponent.svelte';

	export let data: {
		components: { component: string; description: string }[];
	};

</script>
<div class="front-cover">
	<h1 class="title">SQL Arena</h1>
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
<ListComponent components="{data.components}" />
<article>
	<p>Data is divided into components that roughly match the typical, architectural stack of a relational database.
	</p>
</article>


<h2>Queries and Analysis</h2>
<article>
	<p>Queries are bundled into workloads (for example: TPC-H).
		After each query run a post-hoc analysis is done to determine how well the query
		was executed by the database engine. The focus is not just on runtime, but also
		on what we can say about the database engine based on the observed behaviour of the query</p>

	<p>The automated Analysis Includes such things as:</p>

	<ul>
		<li>Runtimes broken into their components (when the engine supports it)</li>
		<li>Query Plan shapes and relational operator usage</li>
		<li>Latency Measurements</li>
		<li>CPU cycle breakdown when viable — falling back estimation when the engine is lacking instrumentation.</li>
		<li>I/O detailed analysis using whatever instrumentation is available</li>
	</ul>

</article>

<h2>How can I contribute?</h2>
<article>
	<p>We are glad you asked!</p>

	<p>You can contribute results to this site via our result repository.</p>

	<p>If you feel like hacking code - you can
		even file Pull Requests against DBProve</p>

	<p>More details are here: <a href="/dbprove/">Contributing</a></p>
</article>

<h2>Disclaimer and Boring Stuff</h2>
<article>
	<p>This site is meant to be educational. It is intended as a way to compare multiple databases against each
		other in as neutral and objective a way as possible.</p>

	<p>We are always looking to improve the site and our measurement. Comments, suggestions and
		improvements are most welcome and can be directed to Thomas Kejser at my LinkedIn account
		or via email.</p>

	<p>All data rendered on this site is made with <a href="/dbprove">DBProve</a> or gathered
		from the analysis of contributors.</p>
</article>
