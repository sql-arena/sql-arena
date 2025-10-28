<h1>DBProve</h1>

<article>
<p>The DBProve tool is a utility written in C++ that can connect to multiple databases and provide
a unified, diagnostic interface to them.</p>

<p>This allows us to compare query plans across databases as well as gain deeper insights into
I/O patterns, CPU usage, Relational Operator performance and other critical aspects of the test database</p>

<p>DBProve is always being expanded and improved. You can contribute to this effort via a
variety of initiatives:</p>

<ul>
	<li>Writing new Database Drivers to support your favourite</li>
	<li>Adding new Theorems — The DBProve name for a test with automated analysis</li>
	<li>Fixing bugs, improving user experience or just generally making the utilty better</li>
	<li>Improving cross-platform support and portability</li>
	<li>Contributing test results</li>
</ul>

<p>DBProve is written using a modern C++23 standard. It is open source under the Apache License.
	It compiles into a single binary (using static linking whenever possible), so it can be easily
	distributed to servers without needing to install any dependencies.
</p>
</article>
<h2>Contributing Results</h2>

<article>
<p>You can contribute test results to this site by using DBProve to run Theorems and uploading
the artifacts DBProve creates (it is a bunch of CSV files). Once you have collected the
results you file a PR against the result repository.</p>

<p>Contributing results is  done via this repo:
	<a href="https://github.com/sql-arena/dbprove-results">dbprove-results</a>.
	In the README file of that repo you the exact process is described.</p>
</article>