<script lang="ts">

</script>

<h1>Legend &mdash; Interpreting Query Plans</h1>

<article>
	<p>Query Plans are rendered in a standard format that unifies the plans
		across engines.</p>

	<p>Since Logical Plans are mostly pointless from a point of comparing capability, we are focused
	on the actual, physical plan being executed by the entire (since that is what you measure as
	useful functionality)</p>

</article>

<table class="data">
	<caption>Query Plan Nodes</caption>
	<thead>
	<tr>
		<th class="grouped">Node</th>
		<th class="text">Description</th>
	</tr>
	</thead>
	<tbody>
	<tr>
		<td class="grouped"><span class="plan-keyword">TABLE</span></td>
		<td class="text"><p>The scanning or seek of a table. </p>

			<ul>
				<li><span class="plan-keyword">SCAN</span> - The table was scanned - total rows visited (as reported by the engine) are rendered as actual.</li>
				<li><span class="plan-keyword">SEEK</span> - Some kind of indexing structure was used to find rows matching a filter. Total rows retrieved from the seek are rendered</li>
			</ul>

			<p>If a <span class="plan-keyword">WHERE</span> is present, it means the query engine was able to push down a
				filter.</p>
		</td>
	</tr>
	<tr>
		<td class="grouped"><span class="plan-keyword">JOIN</span></td>
		<td class="text"><p>A join operator along with its type</p>
			<ul>
				<li><span class="plan-keyword">HASH</span> &mdash; Includes hashes incrementally populated via looping</li>
				<li><span class="plan-keyword">LOOP</span> &mdash; Includes both index seeking and index scanning</li>
				<li><span class="plan-keyword">MERGE</span></li>
				<li><span class="plan-keyword">CROSS—</span> &mdash; Joins without filters or filters that are not served by any hash or
					loop strategy.
				</li>
			</ul>
			<p>The plan is rendered as a tree with the convention that the rightmost child the probe or
				lookup side in join. </p>
			<ul>
				<li>In <span class="plan-keyword">HASH JOIN</span> - Rightmost child is the build side</li>
				<li>In <span class="plan-keyword">HASH JOIN</span> - Right child is the side being seeked</li>
			</ul>
		</td>
	</tr>
	<tr>
		<td class="grouped"><span class="plan-keyword">SORT</span></td>
		<td class="text"><p>Any sort operation leading up to <span class="plan-keyword">WINDOW AGGREGATE</span>
			, <span class="plan-keyword">AGGREGATE</span>, <span class="plan-keyword">MERGE JOIN</span> or just the side
			effect of an <code>ORDER BY</code> in the code</p>
		</td>
	</tr>
	<tr>
		<td class="grouped"><span class="plan-keyword">GROUP BY</span></td>
		<td class="text"><p>Aggregation done directly with <code>GROUP BY</code> or
			indirectly via <code>DISTINCT</code>. The strategy is postfixed to the aggregate </p>
			<ul>
				<li><span class="plan-keyword">HASH</span>
					- A hash table is used for aggregation</li>
				<li><span class="plan-keyword">SORT</span> &mdash; A sorted input stream is used. There will be a
					<span class="plan-keyword">SORT</span> node earlier in the plan
				</li>
			</ul>
		</td>
	</tr>
	<tr>
		<td class="grouped"><span class="plan-keyword">PROJECT</span></td>
		<td class="text"><p>Any projection of data that changes either column count
			or calculates new expressions
		</p></td>
	</tr>
	<tr>
		<td class="grouped"><span class="plan-keyword">FILTER</span></td>
		<td class="text"><p>An operator removing rows from the incoming stream along
			with a description of what is removed.
		</p>
		</td>
	</tr>
	</tbody>
</table>
