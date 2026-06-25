<script lang="ts">
	export let sql: string = '';

	function escapeHtml(text: string): string {
		return text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
	}

	const KEYWORDS = /\b(SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|FULL|CROSS|ON|AND|OR|NOT|AS|DISTINCT|GROUP\s+BY|ORDER\s+BY|HAVING|LIMIT|OFFSET|WITH|UNION|ALL|IN|BETWEEN|LIKE|IS|NULL|CASE|WHEN|THEN|ELSE|END|EXISTS|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|VIEW|USING|NATURAL|FETCH|FIRST|NEXT|ROWS?|ONLY)\b/gi;
	const FUNCTIONS = /\b(MIN|MAX|COUNT|SUM|AVG|COALESCE|NULLIF|CAST|TRY_CAST|TRIM|LENGTH|UPPER|LOWER|SUBSTR|SUBSTRING|REPLACE|ROUND|FLOOR|CEIL|ABS|NOW|DATE|EXTRACT|DENSE_RANK|RANK|ROW_NUMBER|OVER|PARTITION\s+BY|UNNEST|STRING_SPLIT|ARRAY_AGG)\b/gi;

	$: highlighted = (() => {
		if (!sql) return '';
		// Process line by line to handle comments correctly
		return sql.split('\n').map(line => {
			// Block comment lines (simplified: whole-line /* */ or -- comments)
			const trimmed = line.trimStart();
			if (trimmed.startsWith('--')) {
				return `<span class="sql-comment">${escapeHtml(line)}</span>`;
			}
			if (trimmed.startsWith('/*') || trimmed.startsWith('*')) {
				return `<span class="sql-comment">${escapeHtml(line)}</span>`;
			}

			let escaped = escapeHtml(line);
			// Highlight string literals (single-quoted)
			escaped = escaped.replace(/&#039;([^&#039;]*)&#039;/g, `<span class="sql-string">&#039;$1&#039;</span>`);
			// Highlight functions before keywords (more specific)
			escaped = escaped.replace(FUNCTIONS, `<span class="sql-function">$1</span>`);
			// Highlight keywords
			escaped = escaped.replace(KEYWORDS, `<span class="sql-keyword">$1</span>`);
			return escaped;
		}).join('\n');
	})();
</script>

{#if sql}
<pre class="sql-block"><code>{@html highlighted}</code></pre>
{/if}
