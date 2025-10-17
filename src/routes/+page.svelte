<div style="background-image: url('/img/arena-front.png');
	background-repeat: no-repeat;">


<h1>SQL Arena</h1>
	<div style="height: 200px"></div>


<h2>What are Theorems?</h2>
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

<h2>Planner</h2>
<article>
	<p>
		Focusing on the big ticket items that bring your <b>big-O</b> complexity down.
		This component section is all about the shapes of query plans and the power of the
		query optimiser.
	</p>
</article>

<h2>Execution Engine</h2>
<article>
	<p>Measuring the strength of the individual operators in the Execution Engine. </p>
	<p>Classifying
		things like: "How many CPU cycles are needed to do a hash join?" and detailed level
		breakdown of spilling (falling back to disk) behavior</p>

	<p>Also measures bandwidth of distributed clusters.</p>
</article>

<h2>Storage Engine</h2>
<article>
	<p>Focus on raw speeds against your storage.</p>

	<p>Measuring things like:</p>
	<ul>
		<li>Iceberg vs. Delta</li>
		<li>NVMe max speeds vs. whatever EBS gives you</li>
		<li>The impact of object storage on your cloud.</li>
		<li>How fast the engine can run when given all its needs</li>
	</ul>

</article>



</div>


