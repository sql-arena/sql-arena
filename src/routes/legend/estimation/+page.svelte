<script lang="ts">
	import { EstimateMagnitudeGraph, DataRank } from "$lib/components";

	const data = [
		{ magnitude: ">16x", count: 4 },
		{ magnitude: "+8x", count: 5 },
		{ magnitude: "+4x", count: 4 },
		{ magnitude: "=", count: 3 },
		{ magnitude: "-4x", count: 1 },
		{ magnitude: "-8x", count: 0 },
		{ magnitude: "<16x", count: 1 },
	]
</script>

<h1>Legend</h1>
<h2>Interpreting Estimation Accuracy</h2>

<article>

<p>The bar chart shows 7 categories of mis-estimation:</p>
<ul>
	<li>Estimate is more than <span class="gradient-scale--3"><b>16x</b></span> too low</li>
	<li>Estimate is more than <span class="gradient-scale--2"><b>8x</b></span> too low</li>
	<li>Estimate is more than <span class="gradient-scale--1"><b>4x</b></span> too low</li>
	<li><span class="gradient-scale-0"><b>Within +/- 2x</b></span> - this is good!</li>
	<li>Estimate is more <span class="gradient-scale-1"><b>4x</b></span> too high</li>
	<li>Estimate is more than <span class="gradient-scale-2"><b>8x</b></span> too high</li>
	<li>Estimate is more than <span class="gradient-scale-3"><b>16x</b></span> too high</li>
</ul>
<p>The height of the bar is the number of nodes in the query plan with that error.
	When estimates are good, the data gathers around the center of the bar chart</p>

	<h2>Example</h2>
<p>	Consider this data:</p>

	<table class="data">
		<thead>
		<tr>
			<th rowspan="2">Workload</th>
			<th colspan="2">Joining</th>
		</tr>
			<tr>
				<th class="sub-header">Rows Processed</th>
				<th class="sub-header">Estimation Accuracy</th>
			</tr>
		</thead>
		<tbody>
		<tr>
			<td><b>TPC-H</b></td>
			<td>1.2M</td>
			<td>
				<EstimateMagnitudeGraph data="{data}"/>
			</td>
		</tr>
		</tbody>
	</table>
	<p>Here, we can see that the Database Engine we are looking at tends to over estimate the row count of joins - at least
	for the <b>TPC-H</b> workload.</p>

	<p>We can also see that  the entire workload of <b>TPC-H</b> did <b>1.2M</b> join operations.</p>
</article>


<h2>Interpreting Rank</h2>
<article>
	<p>Rank is assigned for each category of operation the database engine will have to do. You can
	win for one operation and lose for another.</p>

	<p>Lower number of operations is better (less work needs doing). The three lowest values for each
	operation are given:</p>

	<ul>
		<li><DataRank rank="1"/> - Best Score</li>
		<li><DataRank rank="2"/> - Second Best</li>
		<li><DataRank rank="3"/> - Third Best</li>
	</ul>

	<p>The ranking is dense, so you can share the top seat with another engine. Databases that are not in the
	top 3 earns no stars. Because some database (notably PostgreSQL) don't report exact row counts, the Row counts  are rounded
	down to nearest 10s before ranking.</p>

	<p>The final scoreboard adds up rowcounts for all workloads, operators and queries and then rank the overall best.</p>

</article>