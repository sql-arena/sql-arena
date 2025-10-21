<script lang="ts">
	export let plan: string = "";

	function escapeHtml(text: string): string {
		return text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
	}


	function highlight(line: string, find: string[], css_class: string ) {
		return line.replace(
			new RegExp(`(?<!\\w)(${find.join('|')})(?!\\w)`, 'g'),
			`<span class="plan-${css_class}">$1</span>`
		);
	}

	function highlightBoxDrawing(line) {
		return line.replace(
			/([\u2500-\u257F]+)/gu,
			`<span class="plan-lines">$1</span>`
		);
	}

	const keywords = [
		'SCAN',
		'INNER',
		'JOIN',
		'GROUP',
		'BY',
		'HASH',
		'AGGREGATE',
		'PROJECT',
		'ON',
		'WHERE',
		'SORT'
	];

	const ops = [
		'=',
		'!=',
		'<=',
		'>=',
		'&lt;=',
		'&gt;=',
		'&lt;',
		'&gt;',
		'\\*',
		'\\-',
		'\\+',
		'AND',
		'OR',
		'NOT',
	];

	const funcs = ['SUM', 'COUNT', 'AVG', 'MIN', 'MAX'];

	$: prettyPlan = plan
		.split('\n')
		.map((line, idx) => {
			if (idx === 0) {
				return `<span class="plan-header">${line.trim()}</span>`
			}
			const estimate = `<span class="plan-estimates">${line.slice(0, 20)}</span>`;
			let rest = escapeHtml(line.slice(20));
			rest = highlight(rest, keywords, "keyword");
			rest = highlight(rest, ops, "operator");
			rest = highlight(rest, funcs, "function");
			rest = highlightBoxDrawing(rest);
			return `${estimate}${rest}`
		})
		.join('\n');
</script>
<pre class="query-plan"><code>{@html prettyPlan}</code></pre>
