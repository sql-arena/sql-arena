<script lang="ts">
	import { formatRows } from '$lib/format.js';

	export let value: number = "";
	$: bigValue = formatRows(value);
	$: _num = typeof value === 'number' ? value : Number(value) || 0;
	$: smallValue = (() => {
		const units = ['', 'K', 'M', 'G', 'T', 'P'];
		let n = Math.abs(_num);
		const sign = _num < 0 ? '-' : '';
		let idx = 0;
		while (n >= 1000 && idx < units.length - 1) {
			n /= 1000;
			idx++;
		}
		let curr = n;
		let i = idx;
		while (true) {
			for (const dec of [1, 0]) {
				const factor = Math.pow(10, dec);
				let v = Math.round(curr * factor) / factor;
				if (v >= 1000 && i < units.length - 1) continue;
				const s = v.toFixed(dec).replace(/\.0$/, '') + units[i];
				if (s.length <= 4) return sign + s;
			}
			if (i < units.length - 1) {
				curr = curr / 1000;
				i++;
				continue;
			}
			return sign + String(_num).slice(0, 4);
		}
	})();
</script>
<div class="big-value">{bigValue}</div><div class="small-value">{smallValue}</div>
